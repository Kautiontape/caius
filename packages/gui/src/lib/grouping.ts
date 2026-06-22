import type { UiTask } from './api';

export type SourceGroup = {
  kind: 'project' | 'document';
  key: string;   // stable id for collapse persistence
  title: string;
  tasks: UiTask[];
};

export function documentTitle(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.md$/i, '');
}

export function groupSource(tasks: UiTask[]): SourceGroup[] {
  const projects = new Map<string, UiTask[]>();
  const docs = new Map<string, { tasks: UiTask[] }>();
  for (const t of tasks) {
    if (t.project) {
      (projects.get(t.project) ?? projects.set(t.project, []).get(t.project)!).push(t);
    } else {
      (docs.get(t.file) ?? docs.set(t.file, { tasks: [] }).get(t.file)!).tasks.push(t);
    }
  }
  const byKey = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  const projectGroups: SourceGroup[] = [...projects.entries()]
    .map(([title, tasks]) => ({ kind: 'project' as const, key: `project:${title}`, title, tasks }))
    .sort(byKey);
  const docGroups: SourceGroup[] = [...docs.entries()]
    .map(([file, { tasks }]) => ({ kind: 'document' as const, key: `doc:${file}`, title: documentTitle(file), tasks }))
    .sort(byKey);
  return [...projectGroups, ...docGroups];
}
