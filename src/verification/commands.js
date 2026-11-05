import { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Set up Verified / Unverified roles, who can see which channels, and a Verify button with captcha')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild),

  new SlashCommandBuilder()
    .setName('verification-settings')
    .setDescription('Captcha, security, lockout, log and message settings for verification')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  new SlashCommandBuilder()
    .setName('verification-restore')
    .setDescription('Undo the last verification setup and bring the old channel permissions back')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show how verification works')
    .setContexts(InteractionContextType.Guild),
].map((c) => c.toJSON());
