import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `kortext serve` — build the command pair (backend + dashboard) that
 * needs to be spawned. Kept as a pure function so the resolution logic
 * (which executable, which cwd, dev vs. compiled) is unit-testable.
 *
 * `bin/kortext.ts` owns the actual spawning + SIGINT routing.
 */

export type ServeMode = 'dev' | 'prod' | 'auto';

export type ServeCommand = {
  name: 'server' | 'web';
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

export type BuildServeCommandsInput = {
  /** Where the kortext package is installed (cwd is the user's project). */
  packageRoot: string;
  /** Where to run the user's project against (DB / workflows / agents). */
  projectDir: string;
  /** Override paths for tests; default is real fs checks under packageRoot. */
  mode?: ServeMode;
  port?: number;
  /** Provide alternate existsSync impl for tests. */
  existsImpl?: (path: string) => boolean;
};

export type ResolvedServePlan = {
  mode: 'dev' | 'prod';
  commands: ServeCommand[];
};

/**
 * Resolve dev vs prod from package state when caller passes 'auto':
 * - prod when both compiled server (`dist/server/index.js`) and built web
 *   (`dist/web/index.html`) are present
 * - dev otherwise (uses tsx + vite from devDependencies)
 */
export function buildServeCommands(input: BuildServeCommandsInput): ResolvedServePlan {
  const exists = input.existsImpl ?? existsSync;
  const mode = resolveMode(input.packageRoot, input.mode ?? 'auto', exists);

  const baseEnv: Record<string, string> = {};
  if (input.port !== undefined) {
    baseEnv.KORTEXT_PORT = String(input.port);
  }

  if (mode === 'prod') {
    // Production: one process. Express serves the compiled dashboard from
    // `dist/web/` itself (see server/index.ts), so no separate vite preview
    // child is needed. This is what fixed the v3.0.0 bug where a global
    // install (which doesn't carry vite as a devDependency) couldn't
    // `npx vite preview` and the parent killed the backend in response.
    const envWithPackageRoot = { ...baseEnv, KORTEXT_PACKAGE_ROOT: input.packageRoot };
    return {
      mode,
      commands: [
        {
          name: 'server',
          command: process.execPath,
          args: [join(input.packageRoot, 'dist', 'server', 'index.js')],
          cwd: input.projectDir,
          env: envWithPackageRoot,
        },
      ],
    };
  }

  return {
    mode,
    commands: [
      {
        name: 'server',
        command: 'npx',
        args: ['tsx', join(input.packageRoot, 'server', 'index.ts')],
        cwd: input.projectDir,
        env: baseEnv,
      },
      {
        name: 'web',
        command: 'npx',
        args: ['vite', '--host'],
        cwd: input.packageRoot,
        env: baseEnv,
      },
    ],
  };
}

function resolveMode(
  packageRoot: string,
  requested: ServeMode,
  exists: (path: string) => boolean,
): 'dev' | 'prod' {
  if (requested === 'dev') return 'dev';
  if (requested === 'prod') return 'prod';
  const compiledServer = join(packageRoot, 'dist', 'server', 'index.js');
  const builtWeb = join(packageRoot, 'dist', 'web', 'index.html');
  return exists(compiledServer) && exists(builtWeb) ? 'prod' : 'dev';
}
