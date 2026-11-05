// Verification add-on for Brian: Verified/Unverified roles, channel access and an image captcha.
// Everything lives in this folder; src/index.js only plugs it in.

import { commands } from './commands.js';
import { onVerificationCommand, onVerificationComponent, onVerifyButton, onMemberJoin, restoreVerification, VID } from './verification.js';
import { CID, onEnterCode, onRefresh, onCodeSubmit } from './verify-flow.js';
import { onSettingsCommand, onSettingsComponent, onSettingsModal } from './verify-settings.js';
import { recoverAll, recoverGuild } from './recover.js';
import { simpleEmbed } from './ui.js';

export { onMemberJoin, recoverAll, recoverGuild };

/** Slash command definitions to register together with Brian's own. */
export const verificationCommands = commands.filter((c) => c.name !== 'help');

const slash = {
  verification: onVerificationCommand,
  'verification-settings': onSettingsCommand,
  'verification-restore': restoreVerification,
};

/** Handles verification interactions. Returns true if the interaction belonged to verification. */
export async function handleVerificationInteraction(interaction) {
  if (!interaction.inGuild()) return false;
  const id = interaction.customId ?? '';
  let run = null;
  if (interaction.isChatInputCommand() && slash[interaction.commandName]) run = slash[interaction.commandName];
  else if (interaction.isButton() && id === VID.verifyButton) run = onVerifyButton;
  else if (interaction.isButton() && id === CID.enter) run = onEnterCode;
  else if (interaction.isButton() && id === CID.refresh) run = onRefresh;
  else if (interaction.isModalSubmit() && id === CID.modal) run = onCodeSubmit;
  else if (interaction.isMessageComponent() && id.startsWith('vset:')) run = onSettingsComponent;
  else if (interaction.isModalSubmit() && id.startsWith('vset:')) run = onSettingsModal;
  else if (interaction.isMessageComponent() && id.startsWith('verif:')) run = onVerificationComponent;
  if (!run) return false;

  try {
    await run(interaction);
  } catch (err) {
    console.error('[verification]', err);
    const msg = { ...simpleEmbed(`❌ Something went wrong: ${err.message}`, 0xed4245), flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else if (interaction.isRepliable()) await interaction.reply(msg).catch(() => {});
  }
  return true;
}
