// Slack alerting: SLACK_TOKEN + channel, POST to chat.postMessage.
//
// Failures are best-effort — alerting must never throw into render paths.

const SLACK_API = 'https://slack.com/api/chat.postMessage';

export async function alert({ channel, text }) {
  const token = process.env.SLACK_TOKEN;
  const targetChannel = channel || process.env.IMAGE_CORE_SLACK_CHANNEL || process.env.SLACK_CHANNEL;
  if (!token || !targetChannel) {
    // Silent no-op when not configured. Fine for dev / tests.
    return { sent: false, reason: 'no_token_or_channel' };
  }
  try {
    const res = await fetch(SLACK_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: targetChannel, text }),
      signal: AbortSignal.timeout(5000),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: String(e.message || e) };
  }
}

export async function alertRenderFailure({ platform, layout, specHash, error }) {
  const msg = [
    `:rotating_light: image-core render failed`,
    `route: ${platform}/${layout}`,
    `specHash: ${specHash || '(pre-hash)'}`,
    `code: ${error?.code || 'unknown'}`,
    `error: ${String(error?.message || error).slice(0, 800)}`,
  ].join('\n');
  return alert({ text: msg });
}
