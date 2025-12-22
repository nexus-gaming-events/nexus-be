import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, primaryKey, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['player', 'spectator']);
export const friendStatusEnum = pgEnum('friend_status', ['pending', 'accepted', 'blocked']);

// 1. Users
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email'), // Nullable for Steam users
    avatarUrl: text('avatar_url'),
    discordId: text('discord_id').unique(),
    steamId: text('steam_id').unique(),
    googleId: text('google_id').unique(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    emailIdx: index('email_idx').on(t.email),
}));

// 2. Friendships
export const friendships = pgTable('friendships', {
    requesterId: integer('requester_id').references(() => users.id).notNull(),
    addresseeId: integer('addressee_id').references(() => users.id).notNull(),
    status: friendStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.requesterId, t.addresseeId] }),
}));

// 3. Groups
export const groups = pgTable('groups', {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id').references(() => users.id).notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const groupMembers = pgTable('group_members', {
    groupId: integer('group_id').references(() => groups.id).notNull(),
    userId: integer('user_id').references(() => users.id).notNull(),
    joinedAt: timestamp('joined_at').defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
}));

// 4. Events
export const events = pgTable('events', {
    id: serial('id').primaryKey(),
    hostId: integer('host_id').references(() => users.id).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    game: text('game').notNull(),
    discordVoiceLink: text('discord_voice_link'),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    maxPlayers: integer('max_players').default(5).notNull(),
    maxSpectators: integer('max_spectators').default(2).notNull(),
    isCancelled: boolean('is_cancelled').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

// 5. Participants
export const participants = pgTable('participants', {
    eventId: integer('event_id').references(() => events.id).notNull(),
    userId: integer('user_id').references(() => users.id).notNull(),
    role: roleEnum('role').default('player').notNull(),
    joinedAt: timestamp('joined_at').defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.userId] }),
}));

// 6. Messages
export const messages = pgTable('messages', {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').references(() => events.id).notNull(),
    userId: integer('user_id').references(() => users.id).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// --- RELATIONS ---

export const usersRelations = relations(users, ({ many }) => ({
    eventsHosted: many(events),
    memberships: many(groupMembers),
    participations: many(participants),
    messages: many(messages),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
    host: one(users, { fields: [events.hostId], references: [users.id] }),
    participants: many(participants),
    messages: many(messages),
}));

export const participantsRelations = relations(participants, ({ one }) => ({
    event: one(events, { fields: [participants.eventId], references: [events.id] }),
    user: one(users, { fields: [participants.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    event: one(events, { fields: [messages.eventId], references: [events.id] }),
    sender: one(users, { fields: [messages.userId], references: [users.id] }),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
    group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
    user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
    owner: one(users, { fields: [groups.ownerId], references: [users.id] }),
    members: many(groupMembers),
}));
