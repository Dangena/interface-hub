describe('Code Parser - Java/Spring Boot', () => {
  const parseJavaController = (code: string) => {
    const interfaces: any[] = [];
    const classAnnotation = /@RestController|@Controller/g;
    if (!classAnnotation.test(code)) return interfaces;

    const methodPattern = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:["']([^"']+)["']\s*)?\)\s*\n?\s*(?:@ResponseBody\s*\n)?\s*(?:public\s+(\w+)\s+(\w+)\s*\()/g;
    
    let match;
    while ((match = methodPattern.exec(code)) !== null) {
      const [, annotation, path, returnType, methodName] = match;
      
      const methodMap: Record<string, string> = {
        GetMapping: 'GET',
        PostMapping: 'POST',
        PutMapping: 'PUT',
        DeleteMapping: 'DELETE',
        PatchMapping: 'PATCH',
      };

      interfaces.push({
        name: methodName,
        path: path || '/',
        method: methodMap[annotation],
        responseBody: returnType,
      });
    }

    return interfaces;
  };

  test('should parse @RestController annotation', () => {
    const code = `@RestController
@RequestMapping("/api/users")
public class UserController {
    @GetMapping("/")
    public List<User> getUsers() {
        return userService.findAll();
    }
}`;
    const result = parseJavaController(code);
    expect(result.length).toBeGreaterThan(0);
  });

  test('should parse @Controller annotation', () => {
    const code = `@Controller
public class UserController {
    @GetMapping("/users")
    public List<User> getUsers() {
        return userService.findAll();
    }
}`;
    const result = parseJavaController(code);
    expect(result.length).toBeGreaterThan(0);
  });

  test('should map HTTP methods correctly', () => {
    const code = `@RestController
@RequestMapping("/api")
public class UserController {
    @GetMapping("/users")
    public List<User> getUsers() { return []; }
    
    @PostMapping("/users")
    public User createUser() { return {}; }
    
    @PutMapping("/users/{id}")
    public User updateUser() { return {}; }
    
    @DeleteMapping("/users/{id}")
    public void deleteUser() {}
    
    @PatchMapping("/users/{id}")
    public User patchUser() { return {}; }
}`;
    const result = parseJavaController(code);
    
    expect(result.length).toBe(5);
    
    const methods = result.map(i => i.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
    expect(methods).toContain('PATCH');
  });

  test('should extract correct paths', () => {
    const code = `@RestController
@RequestMapping("/api")
public class UserController {
    @GetMapping("/users")
    public List<User> getUsers() { return []; }
}`;
    const result = parseJavaController(code);
    
    expect(result[0].path).toBe('/users');
  });

  test('should return empty array for non-controller classes', () => {
    const code = `public class UserService {
    public List<User> getUsers() {
        return userRepository.findAll();
    }
}`;
    const result = parseJavaController(code);
    expect(result).toEqual([]);
  });

  test('should handle multiple methods', () => {
    const code = `@RestController
public class ItemController {
    @GetMapping("/items")
    public List<Item> getItems() { return []; }
    
    @GetMapping("/items/{id}")
    public Item getItem() { return {}; }
    
    @PostMapping("/items")
    public Item createItem() { return {}; }
}`;
    const result = parseJavaController(code);
    expect(result.length).toBe(3);
  });
});

describe('Code Parser - Node.js/Express', () => {
  const parseNodeExpress = (code: string) => {
    const interfaces: any[] = [];
    
    const routerPattern = /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']\s*,\s*(?:async\s*)?(?:\([^)]+\)\s*=>|function\s*\([^)]+\))/g;
    
    let match;
    while ((match = routerPattern.exec(code)) !== null) {
      const [, method, path] = match;
      
      interfaces.push({
        name: path.split('/').filter(p => p && !p.startsWith(':')).join(' ') || 'API',
        path: path,
        method: method.toUpperCase(),
      });
    }

    return interfaces;
  };

  test('should parse router.get', () => {
    const code = `router.get('/users', async (req, res) => {
  const users = await User.findAll();
  res.json(users);
});`;
    const result = parseNodeExpress(code);
    expect(result.length).toBe(1);
    expect(result[0].method).toBe('GET');
  });

  test('should parse router.post', () => {
    const code = `router.post('/users', async (req, res) => {
  const user = await User.create(req.body);
  res.json(user);
});`;
    const result = parseNodeExpress(code);
    expect(result.length).toBe(1);
    expect(result[0].method).toBe('POST');
  });

  test('should parse router.put', () => {
    const code = `router.put('/users/:id', async (req, res) => {
  const user = await User.update(req.params.id, req.body);
  res.json(user);
});`;
    const result = parseNodeExpress(code);
    expect(result.length).toBe(1);
    expect(result[0].method).toBe('PUT');
  });

  test('should parse router.delete', () => {
    const code = `router.delete('/users/:id', async (req, res) => {
  await User.destroy(req.params.id);
  res.json({ message: 'User deleted' });
});`;
    const result = parseNodeExpress(code);
    expect(result.length).toBe(1);
    expect(result[0].method).toBe('DELETE');
  });

  test('should handle multiple routes', () => {
    const code = `router.get('/users', (req, res) => {});
router.post('/users', (req, res) => {});
router.get('/users/:id', (req, res) => {});`;
    const result = parseNodeExpress(code);
    expect(result.length).toBe(3);
  });

  test('should return empty array for no routes', () => {
    const code = `const app = express();
app.use(bodyParser.json());`;
    const result = parseNodeExpress(code);
    expect(result).toEqual([]);
  });

  test('should parse async functions', () => {
    const code = `router.get('/users', async (req, res) => {
  const users = await User.findAll();
  res.json(users);
});`;
    const result = parseNodeExpress(code);
    expect(result.length).toBe(1);
  });
});
