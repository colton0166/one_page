/**
 * 中元普渡法會報名頁 — 靜態網頁 + 訂單通知信
 *
 * 客人送出報名後：
 *   1. 寄一封確認信給客人
 *   2. 同時寄一份訂單副本給你（MAIL_TO）
 *
 * 所有帳號密碼都從環境變數讀取，不會出現在程式碼或網頁裡。
 * 需要在 Coolify 設定的變數見 .env.example。
 */

const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- 設定 ---------- */
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.zoho.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;   // 寄件人必須等於 Zoho 認證帳號
const MAIL_TO   = process.env.MAIL_TO   || SMTP_USER;   // 你收訂單副本的信箱
const SITE_NAME = process.env.SITE_NAME || '中元普渡法會';
const DRYRUN    = process.env.MAIL_DRYRUN === '1';      // 測試用：只印出不真的寄

/* ---------- 郵件傳送器 ---------- */
const transporter = DRYRUN
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,      // 465 用 SSL，587 用 STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

/* ---------- 簡易流量限制：避免有人拿這個端點當免費寄信機 ---------- */
const hits = new Map();               // ip -> 時間戳陣列
const WINDOW_MS = 10 * 60 * 1000;     // 10 分鐘
const MAX_PER_IP = 5;                 // 每個 IP 最多 5 次
const MAX_GLOBAL = 100;               // 全站 10 分鐘最多 100 次
let globalHits = [];

function tooMany(ip) {
  const now = Date.now();
  const keep = t => now - t < WINDOW_MS;

  globalHits = globalHits.filter(keep);
  if (globalHits.length >= MAX_GLOBAL) return true;

  const mine = (hits.get(ip) || []).filter(keep);
  if (mine.length >= MAX_PER_IP) { hits.set(ip, mine); return true; }

  mine.push(now); hits.set(ip, mine); globalHits.push(now);

  // 順手清掉沒在用的 IP，避免記憶體一直長大
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some(keep)) hits.delete(k);
  }
  return false;
}

/* ---------- 工具 ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const nt = n => Number(n).toLocaleString('zh-TW');

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

/** 只留下我們認得的欄位，長度也設上限，避免被塞垃圾內容 */
function clean(v, max = 200) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}
function cleanMultiline(v, max = 1000) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

/* ---------- 信件內容 ---------- */
function buildHtml(o, forOwner) {
  const rows = o.items.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">${esc(i.name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">x${i.qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">NT$ ${nt(i.price * i.qty)}</td>
    </tr>`).join('');

  const field = (label, val) => val
    ? `<tr><td style="padding:4px 12px 4px 0;color:#7a6f68;white-space:nowrap;">${label}</td>
           <td style="padding:4px 0;">${esc(val)}</td></tr>`
    : '';

  return `<!DOCTYPE html><html><body style="margin:0;background:#fdf8f0;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#2b2320;line-height:1.7;">
  <div style="background:#fff;border:1px solid #e7dccb;border-radius:14px;padding:26px 24px;">
    <h1 style="margin:0 0 6px;font-size:20px;color:#a3231f;">${esc(SITE_NAME)}</h1>
    <p style="margin:0 0 22px;color:#7a6f68;font-size:14px;">
      ${forOwner ? '有一筆新的報名' : '我們已收到您的報名，以下是報名內容'}
    </p>

    <h2 style="font-size:15px;margin:0 0 8px;">報名項目</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}
      <tr><td style="padding:12px 0 0;font-weight:700;">合計</td><td></td>
          <td style="padding:12px 0 0;text-align:right;font-weight:700;font-size:17px;color:#a3231f;">
            NT$ ${nt(o.total)}</td></tr>
    </table>

    <h2 style="font-size:15px;margin:24px 0 8px;">報名資料</h2>
    <table style="font-size:14px;border-collapse:collapse;">
      ${field('姓名', o.name)}${field('電話', o.phone)}${field('Email', o.email)}
      ${field('地址', o.address)}${field('付款方式', o.pay)}
    </table>

    ${o.blessing ? `<h2 style="font-size:15px;margin:24px 0 8px;">祈福／牌位</h2>
      <div style="font-size:14px;white-space:pre-wrap;">${esc(o.blessing)}</div>` : ''}

    ${o.note ? `<h2 style="font-size:15px;margin:24px 0 8px;">備註</h2>
      <div style="font-size:14px;white-space:pre-wrap;">${esc(o.note)}</div>` : ''}

    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #e7dccb;color:#7a6f68;font-size:13px;">
      ${forOwner ? '此信由報名網頁自動寄出。'
                 : '此信為系統自動發送，我們將盡快與您聯繫確認。若資料有誤請直接回覆本信。'}
    </p>
  </div>
</div></body></html>`;
}

function buildText(o, forOwner) {
  const L = [`【${SITE_NAME}】`, ''];
  L.push(forOwner ? '有一筆新的報名' : '我們已收到您的報名，以下是報名內容', '');
  L.push('報名項目');
  o.items.forEach(i => L.push(`  ${i.name} x${i.qty}　NT$${nt(i.price * i.qty)}`));
  L.push(`  合計　NT$${nt(o.total)}`, '');
  L.push('報名資料');
  L.push(`  姓名：${o.name}`);
  L.push(`  電話：${o.phone}`);
  L.push(`  Email：${o.email}`);
  if (o.address) L.push(`  地址：${o.address}`);
  L.push(`  付款方式：${o.pay}`);
  if (o.blessing) L.push('', '祈福／牌位', o.blessing);
  if (o.note)     L.push('', '備註', o.note);
  return L.join('\n');
}

/* ---------- 收訂單 ---------- */
app.use(express.json({ limit: '32kb' }));
app.set('trust proxy', 1);            // Coolify 前面有反向代理，要這樣才拿得到真實 IP

app.post('/api/order', async (req, res) => {
  const ip = req.ip || 'unknown';

  if (!SMTP_USER || (!SMTP_PASS && !DRYRUN)) {
    console.error('SMTP 環境變數尚未設定');
    return res.status(503).json({ ok: false, error: '寄信服務尚未設定' });
  }
  if (req.body && req.body.website) {          // 蜜罐欄位：只有機器人會填
    return res.json({ ok: true });             // 假裝成功，不寄信
  }

  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [];

  const o = {
    name:     clean(b.name, 60),
    phone:    clean(b.phone, 40),
    email:    clean(b.email, 120),
    address:  clean(b.address, 200),
    pay:      clean(b.pay, 40),
    blessing: cleanMultiline(b.blessing, 1500),
    note:     cleanMultiline(b.note, 800),
    items: items.map(i => ({
      name:  clean(i.name, 60),
      price: Math.max(0, Math.min(1e7, Number(i.price) || 0)),
      qty:   Math.max(1, Math.min(999, parseInt(i.qty, 10) || 1)),
    })),
  };
  o.total = o.items.reduce((s, i) => s + i.price * i.qty, 0);

  if (!o.name || !o.phone)  return res.status(400).json({ ok:false, error:'姓名與電話為必填' });
  if (!isEmail(o.email))    return res.status(400).json({ ok:false, error:'Email 格式不正確' });
  if (o.items.length === 0) return res.status(400).json({ ok:false, error:'沒有選擇報名項目' });

  // 通過驗證才計入流量限制，客人填錯欄位不會被誤鎖
  if (tooMany(ip)) {
    return res.status(429).json({ ok: false, error: '送出次數過於頻繁，請稍後再試' });
  }

  try {
    // 1) 寄給客人的確認信
    const info = await transporter.sendMail({
      from: `"${SITE_NAME}" <${MAIL_FROM}>`,
      to: o.email,
      subject: `${SITE_NAME}｜報名確認`,
      text: buildText(o, false),
      html: buildHtml(o, false),
    });

    // 2) 寄給自己的訂單副本（失敗不影響客人那封）
    if (MAIL_TO) {
      transporter.sendMail({
        from: `"${SITE_NAME}" <${MAIL_FROM}>`,
        to: MAIL_TO,
        replyTo: o.email,
        subject: `新報名｜${o.name}　NT$${nt(o.total)}`,
        text: buildText(o, true),
        html: buildHtml(o, true),
      }).catch(err => console.error('訂單副本寄送失敗：', err.message));
    }

    // DRYRUN 時把整封信印出來，方便本機檢查內容（正式環境不會執行到）
    if (DRYRUN) console.log('[DRYRUN]', info.message);
    res.json({ ok: true });
  } catch (err) {
    console.error('寄信失敗：', err.message);
    res.status(502).json({ ok: false, error: '信件寄送失敗，請改用 LINE 傳送訂單' });
  }
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

/* ---------- 靜態網頁 ---------- */
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(webp|png|jpe?g|gif|svg|ico|mp4|webm)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000');   // 圖片快取 30 天
    } else if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

app.listen(PORT, () => {
  console.log(`已啟動：http://localhost:${PORT}　寄信模式：${DRYRUN ? 'DRYRUN（不真的寄）' : SMTP_HOST}`);
});
