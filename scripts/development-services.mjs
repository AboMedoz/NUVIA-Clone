import { isAbsolute, resolve } from 'node:path';
import { statSync } from 'node:fs';

export function buildDevelopmentServices({ root, env, withAI }) {
  if (withAI && !env.AI_SERVICE_KEY)
    throw new Error('Run pnpm setup:models before full development.');
  const productEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^(GEMINI_|QWEN_)/i.test(key)),
  );
  const services = [
    {
      name: 'api',
      command: process.execPath,
      args: ['--watch', resolve(root, 'apps/api/src/server.mjs')],
      cwd: root,
      env: productEnv,
    },
    {
      name: 'mail',
      command: process.execPath,
      args: [resolve(root, 'apps/api/scripts/mail-worker.mjs')],
      cwd: root,
      env: productEnv,
    },
    {
      name: 'web',
      command: process.execPath,
      args: [resolve(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
      cwd: resolve(root, 'apps/web'),
      env: productEnv,
    },
  ];
  if (withAI) {
    const python = env.AI_PYTHON_EXECUTABLE;
    if (python) {
      let valid = false;
      try {
        valid = isAbsolute(python) && statSync(python).isFile();
      } catch {
        /* Invalid explicit runtime. */
      }
      if (!valid)
        throw new Error('AI_PYTHON_EXECUTABLE must be an existing absolute executable path.');
    }
    const aiEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => !/^(MONGODB_|MAIL_|SMTP_)/.test(key)),
    );
    services.push({
      name: 'ai',
      command: python || 'uv',
      cwd: python ? resolve(root, 'apps/ai-service') : root,
      env: {
        ...aiEnv,
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      args: python
        ? ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000']
        : [
            'run',
            '--offline',
            '--locked',
            '--directory',
            resolve(root, 'apps/ai-service'),
            'uvicorn',
            'app.main:app',
            '--host',
            '127.0.0.1',
            '--port',
            '8000',
          ],
    });
  }
  return services;
}
