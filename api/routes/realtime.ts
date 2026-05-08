import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

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
const messageHistory = new Map<string, WebSocketMessage[]>();

router.get('/channels', (req, res) => {
  const channels = Array.from(channelSubscriptions.keys()).map(channel => ({
    channel,
    subscriberCount: channelSubscriptions.get(channel)?.size || 0,
    recentMessages: (messageHistory.get(channel) || []).slice(-5),
  }));
  res.json(channels);
});

router.post('/subscribe', (req, res) => {
  const { channel } = req.body;

  if (!channel) {
    res.status(400).json({ error: 'Channel is required' });
    return;
  }

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

  const recentMessages = messageHistory.get(channel) || [];
  for (const msg of recentMessages.slice(-10)) {
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

  if (!messageHistory.has(channel)) {
    messageHistory.set(channel, []);
  }
  const history = messageHistory.get(channel)!;
  history.push(message);
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }

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
  const history = messageHistory.get(channel) || [];
  res.json(history.slice(-limit));
});

router.get('/status', (req, res) => {
  res.json({
    totalSubscriptions: subscriptions.size,
    channels: channelSubscriptions.size,
    channelDetails: Object.fromEntries(
      Array.from(channelSubscriptions.entries()).map(([ch, subs]) => [ch, subs.size])
    ),
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

  if (!messageHistory.has(channel)) {
    messageHistory.set(channel, []);
  }
  const history = messageHistory.get(channel)!;
  history.push(message);
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }

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
