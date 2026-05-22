import { describe, expect, it } from 'vitest';
import { buildServeCommands } from '../server/cli/serve.ts';

describe('buildServeCommands', () => {
  const pkg = '/abs/pkg';
  const proj = '/abs/project';
  const existsFalse = () => false;
  const existsTrue = () => true;

  it("auto-resolves to dev when dist/ is missing (uses tsx + vite)", () => {
    const plan = buildServeCommands({
      packageRoot: pkg,
      projectDir: proj,
      mode: 'auto',
      existsImpl: existsFalse,
    });
    expect(plan.mode).toBe('dev');
    expect(plan.commands).toHaveLength(2);

    const server = plan.commands.find((c) => c.name === 'server')!;
    expect(server.command).toBe('npx');
    expect(server.args[0]).toBe('tsx');
    expect(server.args[1]).toBe(`${pkg}/server/index.ts`);
    expect(server.cwd).toBe(proj);

    const web = plan.commands.find((c) => c.name === 'web')!;
    expect(web.args).toEqual(['vite', '--host']);
    expect(web.cwd).toBe(pkg);
  });

  it('auto-resolves to prod when both compiled server and built web exist', () => {
    const plan = buildServeCommands({
      packageRoot: pkg,
      projectDir: proj,
      mode: 'auto',
      existsImpl: existsTrue,
    });
    expect(plan.mode).toBe('prod');

    const server = plan.commands.find((c) => c.name === 'server')!;
    expect(server.command).toBe(process.execPath);
    expect(server.args).toEqual([`${pkg}/dist/server/index.js`]);
    expect(server.cwd).toBe(proj);

    const web = plan.commands.find((c) => c.name === 'web')!;
    expect(web.args.slice(0, 2)).toEqual(['vite', 'preview']);
  });

  it('forwards --port=N into the server env', () => {
    const plan = buildServeCommands({
      packageRoot: pkg,
      projectDir: proj,
      port: 4242,
      existsImpl: existsFalse,
    });
    for (const c of plan.commands) {
      expect(c.env.KORTEXT_PORT).toBe('4242');
    }
  });

  it("explicit mode='dev' ignores compiled artifacts", () => {
    const plan = buildServeCommands({
      packageRoot: pkg,
      projectDir: proj,
      mode: 'dev',
      existsImpl: existsTrue,
    });
    expect(plan.mode).toBe('dev');
  });

  it("explicit mode='prod' is honoured even if dist/ is missing", () => {
    const plan = buildServeCommands({
      packageRoot: pkg,
      projectDir: proj,
      mode: 'prod',
      existsImpl: existsFalse,
    });
    expect(plan.mode).toBe('prod');
  });
});
