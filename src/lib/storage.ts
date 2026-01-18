/**
 * Storage Layer - CozoDB Backend
 * 
 * Replaces NebulaDB with CozoDB for notes, folders, tags.
 * Keeps function signatures for backwards compatibility.
 */

import { Note, Folder, Tag } from '@/types/notes';
import type { EntityKind } from '@/lib/types/entityTypes';
import { NoteRepo, FolderRepo, TagRepo, CalendarRepo } from './cozo/content';
import type {
  Note as CozoNote,
  Folder as CozoFolder,
  Tag as CozoTag,
  CalendarEvent as CozoCalendarEvent,
  CalendarPeriod as CozoCalendarPeriod,
} from './cozo/content';
import type {
  CalendarDefinition,
  CalendarEvent,
  Period,
} from '@/lib/fantasy-calendar/types';

const STORAGE_KEYS = {
  CURRENT_NOTE_ID: 'inkwell_current_note_id',
} as const;

const DEFAULT_WORLD_ID = 'default';

// =============================================================================
// TYPE ADAPTERS (Cozo -> Legacy)
// =============================================================================

function cozoNoteToLegacy(cozo: CozoNote): Note {
  return {
    id: cozo.id,
    title: cozo.title,
    content: cozo.content,
    markdownContent: cozo.markdownContent,
    folderId: cozo.folderId,
    tags: [], // Tags stored separately via note_tags relation
    createdAt: cozo.createdAt,
    updatedAt: cozo.updatedAt,
    ownerId: cozo.ownerId,
    isEntity: cozo.isEntity,
    entityKind: cozo.entityKind as EntityKind | undefined,
    entitySubtype: cozo.entitySubtype ?? undefined,
    favorite: cozo.favorite ? 1 : 0,
    isPinned: cozo.isPinned ? 1 : 0,
  };
}

function cozoFolderToLegacy(cozo: CozoFolder): Folder {
  // Detect if this is a narrative vault root
  const isNarrativeRoot = cozo.entityKind === 'NARRATIVE';

  return {
    id: cozo.id,
    name: cozo.name,
    parentId: cozo.parentId,
    ownerId: cozo.ownerId,
    createdAt: cozo.createdAt,
    updatedAt: cozo.updatedAt,
    color: cozo.color ?? undefined,
    entityKind: cozo.entityKind as EntityKind | undefined,
    entitySubtype: cozo.entitySubtype ?? undefined,
    entityLabel: cozo.entityLabel ?? undefined,
    isTypedRoot: cozo.isTypedRoot,
    // Narrative Vault Isolation
    isNarrativeRoot,
    // narrativeId is propagated by arborist adapter, not stored in DB
    // NARRATIVE folders have narrativeId = self.id
    narrativeId: isNarrativeRoot ? cozo.id : (cozo.narrativeId ?? undefined),
  };
}

function cozoTagToLegacy(cozo: CozoTag): Tag {
  return {
    id: cozo.id,
    name: cozo.name,
    color: cozo.color,
    ownerId: cozo.ownerId,
  };
}

// =============================================================================
// Notes CRUD operations
// =============================================================================

export async function getAllNotes(): Promise<Note[]> {
  const notes = NoteRepo.listAll(DEFAULT_WORLD_ID);
  return notes.map(cozoNoteToLegacy);
}

export async function getNoteById(id: string): Promise<Note | undefined> {
  const note = NoteRepo.get(id);
  return note ? cozoNoteToLegacy(note) : undefined;
}

export async function createNote(partial?: Partial<Note>): Promise<Note> {
  const defaultContent = partial?.markdownContent ?? partial?.content ?? `# Welcome to Inkwell

Start writing your thoughts here. This editor supports **Markdown** formatting.

## Features

- **Bold** and *italic* text
- Lists and checkboxes
- Code blocks with syntax highlighting
- Tables and images
- And much more...

Happy writing! ✨
`;

  const note = NoteRepo.create({
    worldId: DEFAULT_WORLD_ID,
    title: partial?.title ?? 'Untitled Note',
    content: defaultContent,
    markdownContent: defaultContent,
    folderId: partial?.folderId ?? null,
    entityKind: partial?.entityKind,
    entitySubtype: partial?.entitySubtype,
    isEntity: !!partial?.isEntity,
  });

  return cozoNoteToLegacy(note);
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note | undefined> {
  const updated = NoteRepo.update(id, {
    title: updates.title,
    content: updates.content,
    markdownContent: updates.markdownContent ?? updates.content,
    folderId: updates.folderId,
    entityKind: updates.entityKind ?? null,
    entitySubtype: updates.entitySubtype ?? null,
    isEntity: updates.isEntity !== undefined ? !!updates.isEntity : undefined,
    isPinned: updates.isPinned !== undefined ? !!updates.isPinned : undefined,
    favorite: updates.favorite !== undefined ? !!updates.favorite : undefined,
  });

  return updated ? cozoNoteToLegacy(updated) : undefined;
}

export async function deleteNote(id: string): Promise<boolean> {
  return NoteRepo.delete(id);
}

// Current note management (UI State - localStorage)
export function getCurrentNoteId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_NOTE_ID);
}

export function setCurrentNoteId(id: string | null): void {
  if (id) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_NOTE_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_NOTE_ID);
  }
}

// =============================================================================
// Folders CRUD operations
// =============================================================================

export async function getAllFolders(): Promise<Folder[]> {
  const folders = FolderRepo.listAll(DEFAULT_WORLD_ID);
  return folders.map(cozoFolderToLegacy);
}

export interface CreateFolderOptions {
  entityKind?: EntityKind;
  entitySubtype?: string;
  entityLabel?: string;
  color?: string;
  isTypedRoot?: boolean;
  isSubtypeRoot?: boolean;
}

export async function createFolder(
  name: string,
  parentId: string | null = null,
  options?: CreateFolderOptions
): Promise<Folder> {
  const folder = FolderRepo.create({
    worldId: DEFAULT_WORLD_ID,
    name,
    parentId,
    entityKind: options?.entityKind,
    entitySubtype: options?.entitySubtype,
    entityLabel: options?.entityLabel,
    color: options?.color,
    isTypedRoot: options?.isTypedRoot,
    isSubtypeRoot: options?.isSubtypeRoot,
  });

  return cozoFolderToLegacy(folder);
}

export async function updateFolder(id: string, updates: Partial<Folder>): Promise<Folder | undefined> {
  const updated = FolderRepo.update(id, {
    name: updates.name,
    parentId: updates.parentId,
    entityKind: updates.entityKind ?? null,
    entitySubtype: updates.entitySubtype ?? null,
    entityLabel: updates.entityLabel ?? null,
    color: updates.color ?? null,
    collapsed: undefined, // Not in legacy type
  });

  return updated ? cozoFolderToLegacy(updated) : undefined;
}

export async function deleteFolder(id: string): Promise<boolean> {
  return FolderRepo.delete(id);
}

// =============================================================================
// Tags CRUD operations
// =============================================================================

export async function getAllTags(): Promise<Tag[]> {
  const tags = TagRepo.listAll(DEFAULT_WORLD_ID);
  return tags.map(cozoTagToLegacy);
}

export async function createTag(name: string, color: string = '#3b82f6'): Promise<Tag> {
  const tag = TagRepo.create({
    worldId: DEFAULT_WORLD_ID,
    name,
    color,
  });

  return cozoTagToLegacy(tag);
}

// =============================================================================
// Search functionality
// =============================================================================

export async function searchNotes(query: string): Promise<Note[]> {
  const notes = NoteRepo.search(query, DEFAULT_WORLD_ID);
  return notes.map(cozoNoteToLegacy);
}

export async function findNoteByTitle(title: string): Promise<Note | null> {
  const note = NoteRepo.findByTitle(title, DEFAULT_WORLD_ID);
  return note ? cozoNoteToLegacy(note) : null;
}

// =============================================================================
// Initialization
// =============================================================================

export async function initializeStorage(): Promise<Note> {
  const notes = await getAllNotes();

  if (notes.length === 0) {
    return createNote({
      title: 'Getting Started',
    });
  }

  return notes[0];
}

// =============================================================================
// Calendar CRUD Operations
// Note: Calendar types have different shapes between Cozo and legacy.
// We adapt at the boundary.
// =============================================================================

// Helper to convert Cozo CalendarEvent to legacy format
function cozoEventToLegacy(cozo: CozoCalendarEvent): CalendarEvent {
  return {
    id: cozo.id,
    calendarId: cozo.calendarId,
    title: cozo.title,
    description: cozo.description ?? undefined,
    date: {
      year: cozo.dateYear,
      monthIndex: cozo.dateMonth,
      dayIndex: cozo.dateDay,
      hour: cozo.dateHour ?? undefined,
      minute: cozo.dateMinute ?? undefined,
    },
    endDate: cozo.endYear ? {
      year: cozo.endYear,
      monthIndex: cozo.endMonth ?? cozo.dateMonth,
      dayIndex: cozo.endDay ?? cozo.dateDay,
    } : undefined,
    isAllDay: cozo.isAllDay,
    importance: cozo.importance as any,
    category: cozo.category as any,
    color: cozo.color ?? undefined,
    icon: cozo.icon ?? undefined,
    entityId: cozo.entityId ?? undefined,
    entityKind: cozo.entityKind ?? undefined,
    sourceNoteId: cozo.sourceNoteId ?? undefined,
    parentEventId: cozo.parentEventId ?? undefined,
    createdAt: cozo.createdAt.toISOString(),
    updatedAt: cozo.updatedAt?.toISOString(),
  };
}

function legacyEventToCozo(legacy: Omit<CalendarEvent, 'id'>, calendarId: string): any {
  return {
    worldId: DEFAULT_WORLD_ID,
    calendarId,
    title: legacy.title,
    description: legacy.description,
    dateYear: legacy.date.year,
    dateMonth: legacy.date.monthIndex,
    dateDay: legacy.date.dayIndex,
    dateHour: legacy.date.hour,
    dateMinute: legacy.date.minute,
    endYear: legacy.endDate?.year,
    endMonth: legacy.endDate?.monthIndex,
    endDay: legacy.endDate?.dayIndex,
    isAllDay: legacy.isAllDay,
    importance: legacy.importance,
    category: legacy.category,
    color: legacy.color,
    icon: legacy.icon,
    entityId: legacy.entityId,
    entityKind: legacy.entityKind,
    sourceNoteId: legacy.sourceNoteId,
    parentEventId: legacy.parentEventId,
  };
}

// Helper to convert Cozo CalendarPeriod to legacy Period
function cozoPeriodToLegacy(cozo: CozoCalendarPeriod): Period {
  return {
    id: cozo.id,
    calendarId: cozo.calendarId,
    name: cozo.name,
    description: cozo.description ?? undefined,
    startYear: cozo.startYear,
    startMonth: cozo.startMonth ?? undefined,
    endYear: cozo.endYear ?? undefined,
    endMonth: cozo.endMonth ?? undefined,
    parentPeriodId: cozo.parentPeriodId ?? undefined,
    periodType: cozo.periodType as any,
    color: cozo.color,
    icon: cozo.icon ?? undefined,
    abbreviation: cozo.abbreviation ?? undefined,
    direction: cozo.direction,
    arcType: cozo.arcType as any ?? undefined,
    dominantTheme: cozo.dominantTheme ?? undefined,
    protagonist: cozo.protagonistId ? { id: cozo.protagonistId, kind: '', name: '' } : undefined,
    antagonist: cozo.antagonistId ? { id: cozo.antagonistId, kind: '', name: '' } : undefined,
    summary: cozo.summary ?? undefined,
    showOnTimeline: cozo.showOnTimeline,
    timelineColor: cozo.timelineColor ?? undefined,
    timelineIcon: cozo.timelineIcon ?? undefined,
    createdAt: cozo.createdAt.toISOString(),
    updatedAt: cozo.updatedAt?.toISOString(),
  };
}

// Calendar Events
export async function getAllCalendarEvents(): Promise<CalendarEvent[]> {
  const def = CalendarRepo.getDefinition(DEFAULT_WORLD_ID);
  if (!def) return [];
  const events = CalendarRepo.listEvents(def.id);
  return events.map(cozoEventToLegacy);
}

export async function getCalendarEventById(id: string): Promise<CalendarEvent | undefined> {
  const event = CalendarRepo.getEvent(id);
  return event ? cozoEventToLegacy(event) : undefined;
}

export async function createCalendarEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
  const def = CalendarRepo.getDefinition(DEFAULT_WORLD_ID);
  const calendarId = def?.id ?? 'default-calendar';
  const created = CalendarRepo.createEvent(legacyEventToCozo(event, calendarId));
  return cozoEventToLegacy(created);
}

export async function updateCalendarEvent(
  id: string,
  updates: Partial<CalendarEvent>
): Promise<CalendarEvent | undefined> {
  const updateObj: any = {};
  if (updates.title) updateObj.title = updates.title;
  if (updates.description !== undefined) updateObj.description = updates.description;
  if (updates.date) {
    updateObj.dateYear = updates.date.year;
    updateObj.dateMonth = updates.date.monthIndex;
    updateObj.dateDay = updates.date.dayIndex;
    updateObj.dateHour = updates.date.hour;
    updateObj.dateMinute = updates.date.minute;
  }
  if (updates.endDate) {
    updateObj.endYear = updates.endDate.year;
    updateObj.endMonth = updates.endDate.monthIndex;
    updateObj.endDay = updates.endDate.dayIndex;
  }
  if (updates.isAllDay !== undefined) updateObj.isAllDay = updates.isAllDay;
  if (updates.importance) updateObj.importance = updates.importance;
  if (updates.category) updateObj.category = updates.category;
  if (updates.color !== undefined) updateObj.color = updates.color;
  if (updates.icon !== undefined) updateObj.icon = updates.icon;

  const updated = CalendarRepo.updateEvent(id, updateObj);
  return updated ? cozoEventToLegacy(updated) : undefined;
}

export async function deleteCalendarEvent(id: string): Promise<boolean> {
  return CalendarRepo.deleteEvent(id);
}

// Calendar Periods
export async function getAllCalendarPeriods(): Promise<Period[]> {
  const def = CalendarRepo.getDefinition(DEFAULT_WORLD_ID);
  if (!def) return [];
  const periods = CalendarRepo.listPeriods(def.id);
  return periods.map(cozoPeriodToLegacy);
}

export async function getCalendarPeriodById(id: string): Promise<Period | undefined> {
  const period = CalendarRepo.getPeriod(id);
  return period ? cozoPeriodToLegacy(period) : undefined;
}

export async function createCalendarPeriod(period: Omit<Period, 'id'>): Promise<Period> {
  const def = CalendarRepo.getDefinition(DEFAULT_WORLD_ID);
  const calendarId = def?.id ?? 'default-calendar';

  const created = CalendarRepo.createPeriod({
    worldId: DEFAULT_WORLD_ID,
    calendarId,
    name: period.name,
    description: period.description,
    startYear: period.startYear,
    startMonth: period.startMonth,
    endYear: period.endYear,
    endMonth: period.endMonth,
    parentPeriodId: period.parentPeriodId,
    periodType: period.periodType as any,
    color: period.color,
    icon: period.icon,
    abbreviation: period.abbreviation,
    direction: period.direction as any,
    arcType: period.arcType,
    dominantTheme: period.dominantTheme,
    protagonistId: period.protagonist?.id,
    antagonistId: period.antagonist?.id,
    summary: period.summary,
    showOnTimeline: period.showOnTimeline,
    timelineColor: period.timelineColor,
    timelineIcon: period.timelineIcon,
  });

  return cozoPeriodToLegacy(created);
}

export async function updateCalendarPeriod(
  id: string,
  updates: Partial<Period>
): Promise<Period | undefined> {
  const updated = CalendarRepo.updatePeriod(id, {
    name: updates.name,
    description: updates.description,
    startYear: updates.startYear,
    startMonth: updates.startMonth,
    endYear: updates.endYear,
    endMonth: updates.endMonth,
    parentPeriodId: updates.parentPeriodId,
    periodType: updates.periodType as any,
    color: updates.color,
    icon: updates.icon,
    abbreviation: updates.abbreviation,
    direction: updates.direction as any,
    arcType: updates.arcType,
    dominantTheme: updates.dominantTheme,
    protagonistId: updates.protagonist?.id,
    antagonistId: updates.antagonist?.id,
    summary: updates.summary,
    showOnTimeline: updates.showOnTimeline,
    timelineColor: updates.timelineColor,
    timelineIcon: updates.timelineIcon,
  });

  return updated ? cozoPeriodToLegacy(updated) : undefined;
}

export async function deleteCalendarPeriod(id: string): Promise<boolean> {
  return CalendarRepo.deletePeriod(id);
}

// Calendar Definitions
export async function getCalendarDefinition(): Promise<CalendarDefinition | undefined> {
  const def = CalendarRepo.getDefinition(DEFAULT_WORLD_ID);
  if (!def) return undefined;

  // Convert to legacy CalendarDefinition format
  // Legacy format stores full config as nested object
  // CalendarDefinition expects full structure - we return minimal
  // The actual calendar config should be loaded from storage or created fresh
  return {
    id: def.id,
    name: def.name,
    hoursPerDay: def.hoursPerDay,
    minutesPerHour: def.minsPerHour,
    secondsPerMinute: 60,
    weekdays: [],
    months: [],
    defaultEraId: '',
    eras: [],
    epochs: [],
    timeMarkers: [],
    hasYearZero: false,
    moons: [],
    seasons: [],
    createdFrom: 'manual',
    currentDate: {
      year: def.currentYear,
      monthIndex: def.currentMonth,
      dayIndex: def.currentDay,
    },
  } as CalendarDefinition;
}

export async function saveCalendarDefinition(calendar: CalendarDefinition): Promise<CalendarDefinition> {
  const saved = CalendarRepo.saveDefinition({
    id: calendar.id,
    worldId: DEFAULT_WORLD_ID,
    name: calendar.name ?? 'Default Calendar',
    daysPerWeek: calendar.weekdays?.length ?? 7,
    monthsPerYear: calendar.months?.length ?? 12,
    hoursPerDay: calendar.hoursPerDay ?? 24,
    minsPerHour: calendar.minutesPerHour ?? 60,
    currentYear: calendar.currentDate?.year ?? 1,
    currentMonth: calendar.currentDate?.monthIndex ?? 1,
    currentDay: calendar.currentDate?.dayIndex ?? 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return calendar; // Return the original object for compatibility
}

// Load all calendar data (for initial hydration)
export async function loadCalendarData(): Promise<{
  calendar: CalendarDefinition | undefined;
  events: CalendarEvent[];
  periods: Period[];
}> {
  const [calendar, events, periods] = await Promise.all([
    getCalendarDefinition(),
    getAllCalendarEvents(),
    getAllCalendarPeriods(),
  ]);
  return { calendar, events, periods };
}
