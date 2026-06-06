export function updateCommandPlan(): { command: string; args: string[] } {
  return { command: 'npm', args: ['update', '-g', 'kortext'] };
}
