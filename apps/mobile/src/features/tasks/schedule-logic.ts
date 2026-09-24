import { z } from 'zod';

import type { Task, TaskScheduleDraft } from '@/db/schema';
import { parseJalaliInput, toJalali } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { formatClock, parseClock } from '@/lib/time';

export function scheduleDateText(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

export function initialTaskSchedule(task: Task, now: Date): TaskScheduleDraft {
  if (task.scheduleDraft) return task.scheduleDraft;
  const at = task.dueAt ?? new Date(now.getTime() + 3_600_000);
  return {
    hasDue: task.dueAt !== null,
    dateText: scheduleDateText(at),
    clockText: formatClock(at),
    reminderEnabled: task.reminderEnabled,
    baseSchedule: taskScheduleSignature(task),
  };
}

export function taskScheduleSignature(task: Pick<Task, 'dueAt' | 'reminderEnabled'>): string {
  return JSON.stringify([task.dueAt?.getTime() ?? null, task.reminderEnabled]);
}

/** Raw text survives autosave even when it cannot yet define a deadline. */
export function parseTaskSchedule(fields: TaskScheduleDraft): { dueAt: Date | null; reminderEnabled: boolean } {
  if (!fields.hasDue) return { dueAt: null, reminderEnabled: false };
  const day = parseJalaliInput(fields.dateText);
  const clock = parseClock(fields.clockText);
  if (!day) throw new Error('تاریخ موعد معتبر نیست.');
  if (!clock) throw new Error('ساعت موعد معتبر نیست.');
  return {
    dueAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[0], clock[1]),
    reminderEnabled: fields.reminderEnabled,
  };
}

const taskReminderPayload = z.object({ kind: z.literal('task'), taskId: z.string().min(1) });
export function parseTaskReminder(data: unknown): { kind: 'task'; taskId: string } | null {
  const parsed = taskReminderPayload.safeParse(data);
  return parsed.success ? parsed.data : null;
}
