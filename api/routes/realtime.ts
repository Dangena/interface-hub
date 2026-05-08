import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';

const router = Router();

interface WebSocketMessage {
  id: string;
  channel: string;
  event: string;
  data: any;
  timestamp: string;
}

interface Subscription {
  id: string;
  channel: string;
  res: Response;
  createdAt: string;
}

const subscriptions = new Map<string, Subscription>();
const channelSubscriptions = new Map<string, Set<string>>();

const insertChannelStmt = db.prepare(
  'INSERT OR IGNORE INTO realtime_channels (id, channel, created_at) VALUES (?, ?, ?)'
);

const insertMessageStmt = db.prepare(
  'INSERT INTO realtime_messages (id, channel, event, data, created_at) VALUES (?, ?, ?, ?, ?)'
);

const getRecentMessagesStmt = db.prepare(
  'SELECT id, channel, event, data, created_at FROM realtime_messages WHERE channel = ? ORDER BY created_at DESC LIMIT ?'
);

const getChannelMessagesStmt = db.prepare(
  'SELECT id, channel, event, data, created_at FROM realtime_messages WHERE channel = ? ORDER BY created_at ASC LIMIT ?'
);

function ensureChannel(channel: string) {
  insertChannelStmt.run(uuidv4(), channel, new Date().toISOString());
}

function persistMessage(message: WebSocketMessage) {
  insertMessageStmt.run(
    message.id,
    message.channel,
    message.event,
    JSON.stringify(message.data),
    message.timestamp
  );
}

function rowToMessage(row: any): WebSocketMessage {
  return {
    id: row.id,
    channel: row.channel,
    event: row.event,
    data: row.data ? JSON.parse(row.data) : null,
    timestamp: row.created_at,
  };
}

router.get('/channels', (req, res) => {
  const channels = db.prepare(
    'SELECT channel, created_at FROM realtime_channels ORDER BY created_at ASC'
  ).all() as any[];

  const result = channels.map(ch => ({
    channel: ch.channel,
    subscriberCount: channelSubscriptions.get(ch.channel)?.size || 0,
  }));

  res.json(result);
});

router.post('/subscribe', (req, res) => {
  const { channel } = req.body;

  if (!channel) {
    res.status(400).json({ error: 'Channel is required' });
    return;
  }

  ensureChannel(channel);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const subId = uuidv4();
  const subscription: Subscription = {
    id: subId,
    channel,
    res,
    createdAt: new Date().toISOString(),
  };

  subscriptions.set(subId, subscription);

  if (!channelSubscriptions.has(channel)) {
    channelSubscriptions.set(channel, new Set());
  }
  channelSubscriptions.get(channel)!.add(subId);

  res.write(`event: connected\ndata: ${JSON.stringify({ subscriptionId: subId, channel })}\n\n`);

  const recentRows = getRecentMessagesStmt.all(channel, 10) as any[];
  const recentMessages = recentRows.reverse().map(rowToMessage);
  for (const msg of recentMessages) {
    res.write(`event: ${msg.event}\ndata: ${JSON.stringify(msg)}\n\n`);
  }

  req.on('close', () => {
    subscriptions.delete(subId);
    const subs = channelSubscriptions.get(channel);
    if (subs) {
      subs.delete(subId);
      if (subs.size === 0) {
        channelSubscriptions.delete(channel);
      }
    }
  });
});

router.post('/publish', (req, res) => {
  const { channel, event, data } = req.body;

  if (!channel || !event) {
    res.status(400).json({ error: 'Channel and event are required' });
    return;
  }

  const message: WebSocketMessage = {
    id: uuidv4(),
    channel,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  ensureChannel(channel);
  persistMessage(message);

  const subs = channelSubscriptions.get(channel);
  let sentCount = 0;

  if (subs) {
    for (const subId of subs) {
      const subscription = subscriptions.get(subId);
      if (subscription && !subscription.res.writableEnded) {
        try {
          subscription.res.write(`event: ${event}\ndata: ${JSON.stringify(message)}\n\n`);
          sentCount++;
        } catch {
          subscriptions.delete(subId);
          subs.delete(subId);
        }
      }
    }
  }

  res.json({ success: true, messageId: message.id, subscribers: sentCount });
});

router.post('/unsubscribe', (req, res) => {
  const { subscriptionId } = req.body;

  if (!subscriptionId) {
    res.status(400).json({ error: 'Subscription ID is required' });
    return;
  }

  const subscription = subscriptions.get(subscriptionId);
  if (subscription) {
    const subs = channelSubscriptions.get(subscription.channel);
    if (subs) {
      subs.delete(subscriptionId);
      if (subs.size === 0) {
        channelSubscriptions.delete(subscription.channel);
      }
    }
    subscriptions.delete(subscriptionId);
  }

  res.json({ success: true });
});

router.get('/history/:channel', (req, res) => {
  const { channel } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const rows = getChannelMessagesStmt.all(channel, limit) as any[];
  const messages = rows.map(rowToMessage);
  res.json(messages);
});

router.get('/status', (req, res) => {
  const dbChannels = db.prepare(
    'SELECT channel FROM realtime_channels ORDER BY created_at ASC'
  ).all() as any[];

  const channelDetails: Record<string, number> = {};
  for (const ch of dbChannels) {
    channelDetails[ch.channel] = channelSubscriptions.get(ch.channel)?.size || 0;
  }

  for (const ch of channelSubscriptions.keys()) {
    if (!(ch in channelDetails)) {
      channelDetails[ch] = channelSubscriptions.get(ch)!.size;
    }
  }

  res.json({
    totalSubscriptions: subscriptions.size,
    channels: dbChannels.length,
    channelDetails,
  });
});

export function broadcastToChannel(channel: string, event: string, data: any): number {
  const message: WebSocketMessage = {
    id: uuidv4(),
    channel,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  ensureChannel(channel);
  persistMessage(message);

  let sentCount = 0;
  const subs = channelSubscriptions.get(channel);

  if (subs) {
    for (const subId of subs) {
      const subscription = subscriptions.get(subId);
      if (subscription && !subscription.res.writableEnded) {
        try {
          subscription.res.write(`event: ${event}\ndata: ${JSON.stringify(message)}\n\n`);
          sentCount++;
        } catch {
          subscriptions.delete(subId);
          subs.delete(subId);
        }
      }
    }
  }

  return sentCount;
}

export default router;
