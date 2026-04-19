import { getSupabase } from '../clients/supabase.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import { logger } from '../utils/logger.js';
import type { TenantId } from '../types/auth.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in_progress' | 'done';
  category: 'finance' | 'accounting' | 'cashflow' | 'plan' | 'general';
  source: 'ai_analysis' | 'chat' | 'manual';
  sourceId?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  highPriority: number;
}

/**
 * タスク管理サービス（Supabase永続化、テナント分離）
 * 全メソッドに tenantId を明示的に渡す（シングルトン状態依存なし）
 */
class TaskService {

  async add(tenantId: TenantId, task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const now = new Date().toISOString();
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTask: Task = { ...task, id, createdAt: now, updatedAt: now };

    if (isSupabaseAvailable()) {
      const { error } = await getSupabase().from('tasks').insert({
        id, tenant_id: tenantId, title: task.title, description: task.description || '',
        priority: task.priority, status: task.status, category: task.category,
        source: task.source, source_id: task.sourceId || null, due_date: task.dueDate || null,
      });
      if (error) logger.warn('タスク保存失敗:', error.message);
    }
    logger.info(`タスク追加: ${newTask.title}`);
    return newTask;
  }

  async addBatch(tenantId: TenantId, tasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Task[]> {
    const results: Task[] = [];
    for (const t of tasks) results.push(await this.add(tenantId, t));
    return results;
  }

  async list(tenantId: TenantId, filter?: { status?: string; category?: string }): Promise<Task[]> {
    if (!isSupabaseAvailable()) return [];
    let query = getSupabase().from('tasks').select('*').eq('tenant_id', tenantId);
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.category) query = query.eq('category', filter.category);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) { logger.warn('タスク取得失敗:', error.message); return []; }
    return (data || []).map(mapTask);
  }

  async get(id: string): Promise<Task | null> {
    if (!isSupabaseAvailable()) return null;
    const { data, error } = await getSupabase().from('tasks').select('*').eq('id', id).single();
    if (error) return null;
    return mapTask(data);
  }

  async update(id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'status' | 'category' | 'dueDate'>>): Promise<Task | null> {
    if (!isSupabaseAvailable()) return null;
    const dbUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.status === 'done') dbUpdates.completed_at = new Date().toISOString();

    const { data, error } = await getSupabase().from('tasks').update(dbUpdates).eq('id', id).select().single();
    if (error) { logger.warn('タスク更新失敗:', error.message); return null; }
    return mapTask(data);
  }

  async delete(id: string): Promise<boolean> {
    if (!isSupabaseAvailable()) return false;
    const { error } = await getSupabase().from('tasks').delete().eq('id', id);
    return !error;
  }

  async getSummary(tenantId: TenantId): Promise<TaskSummary> {
    const tasks = await this.list(tenantId);
    return {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      done: tasks.filter(t => t.status === 'done').length,
      highPriority: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length,
    };
  }

  async generateFromAnalysis(tenantId: TenantId, analysisId: string, actions: { priority: string; content: string; effect: string; timeframe: string }[]): Promise<Task[]> {
    const priorityMap: Record<string, 'high' | 'medium' | 'low'> = { high: 'high', medium: 'medium', low: 'low' };
    const newTasks = actions.map(a => ({
      title: a.content,
      description: `効果: ${a.effect}\n期間: ${a.timeframe}`,
      priority: priorityMap[a.priority] || 'medium' as const,
      status: 'todo' as const,
      category: 'finance' as const,
      source: 'ai_analysis' as const,
      sourceId: analysisId,
    }));
    return this.addBatch(tenantId, newTasks);
  }

  async addFromChat(tenantId: TenantId, title: string, description: string = ''): Promise<Task> {
    return this.add(tenantId, {
      title, description, priority: 'medium', status: 'todo', category: 'general', source: 'chat',
    });
  }

  async exportForAssistant(tenantId: TenantId): Promise<{ summary: TaskSummary; activeTasks: Task[]; completedTasks: Task[] }> {
    const tasks = await this.list(tenantId);
    return {
      summary: await this.getSummary(tenantId),
      activeTasks: tasks.filter(t => t.status !== 'done'),
      completedTasks: tasks.filter(t => t.status === 'done'),
    };
  }
}

function mapTask(r: any): Task {
  return {
    id: r.id, title: r.title, description: r.description || '',
    priority: r.priority, status: r.status, category: r.category,
    source: r.source, sourceId: r.source_id, dueDate: r.due_date,
    createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  };
}

export const taskService = new TaskService();
