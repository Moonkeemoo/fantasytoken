import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import type { ShareService } from './share.service.js';
import { renderShareCardPng } from './share.render.js';

export interface ShareRoutesDeps {
  share: ShareService;
  /** Public base URL of the API (used to absolute-link the og:image). */
  apiBaseUrl: string;
}

export function makeShareRoutes(deps: ShareRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * GET /share/:entryId
     * HTML page with OpenGraph + Twitter meta tags so any platform that fetches the
     * URL (Telegram, Twitter, Slack, etc) renders a rich preview with the share-card image.
     * No auth — share links are intentionally public.
     */
    app.get('/:entryId', async (req, reply) => {
      const { entryId } = z.object({ entryId: z.string().uuid() }).parse(req.params);
      const data = await deps.share.load(entryId);
      if (!data) throw errors.notFound('share');

      const imageUrl = `${deps.apiBaseUrl}/share/${entryId}/image.png`;
      const refLink = `https://t.me/fantasytokenbot/fantasytoken?startapp=ref_${data.user.telegramId}`;
      const title = `${data.user.displayName} · #${data.finalRank ?? '—'} of ${data.totalEntries} · Fantasy Token`;
      const desc =
        data.prizeCents > 0
          ? `Won $${(data.prizeCents / 100).toFixed(2)} in ${data.contestName}. Tap to play.`
          : `Played ${data.contestName} on Fantasy Token. Tap to join.`;

      reply.type('text/html; charset=utf-8');
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(desc)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(refLink)}" />
  </head>
  <body style="margin:0;font-family:system-ui;background:#f6f1e8;color:#1a1814;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
    <div style="text-align:center;max-width:480px">
      <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(title)}</h1>
      <p style="margin:0 0 20px;color:#65615b">${escapeHtml(desc)}</p>
      <a href="${escapeHtml(refLink)}" style="display:inline-block;background:#1a1814;color:#f6f1e8;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Open in Telegram →</a>
    </div>
  </body>
</html>`;
    });

    /**
     * GET /share/:entryId/image.png — generated PNG. Cached aggressively because
     * finalized contest data is immutable.
     */
    app.get('/:entryId/image.png', async (req, reply) => {
      const { entryId } = z.object({ entryId: z.string().uuid() }).parse(req.params);
      const data = await deps.share.load(entryId);
      if (!data) throw errors.notFound('share');

      const png = await renderShareCardPng(data);
      reply.header('content-type', 'image/png');
      reply.header('cache-control', 'public, max-age=86400, immutable');
      return png;
    });
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
