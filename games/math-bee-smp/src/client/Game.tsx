'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowLeft, BookOpen, Users, Heart, Copy, Check, Sparkles, X, Trophy, Wifi, WifiOff, LogOut, Play, LoaderCircle, HelpCircle, CheckCircle2, AlertCircle, Clock3, RotateCcw, ChevronRight, Share2 } from './icons';
import World from './World';
import './game.css';
import type { PublicSnapshot as Snapshot, Identity as Guest } from '../game/types';

const AVATARS = [
  { name: 'Coral', color: '#f17d8b', shade: '#b94463' },
  { name: 'Mint', color: '#71c9ad', shade: '#318d7c' },
  { name: 'Lilac', color: '#a18cdb', shade: '#6a54a0' },
  { name: 'Sunny', color: '#f5c85d', shade: '#ba8e2d' },
  { name: 'Ocean', color: '#81bde3', shade: '#4086b6' },
  { name: 'Peach', color: '#eda580', shade: '#bd7159' },
];

class ApiFailure extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiFailure'; }
}

async function api<T>(url: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new ApiFailure(data.error || 'Permintaan belum berhasil. Coba lagi.', response.status);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Koneksi lambat. Memeriksa kembali keadaan room…');
    throw error;
  } finally { window.clearTimeout(timeout); }
}

function Face({ avatar = 0, small = false }: { avatar?: number; small?: boolean }) {
  const preset = AVATARS[Math.abs(Number(avatar) || 0) % AVATARS.length];
  return <span className={`avatar-face ${small ? 'small' : ''}`} style={{ '--avatar': preset.color, '--avatar-shade': preset.shade } as React.CSSProperties} aria-hidden="true"><span className="avatar-hair" /><span className="avatar-eye left" /><span className="avatar-eye right" /><span className="avatar-smile" /></span>;
}

function BeeMark() {
  return <span className="bee-mark" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M18 2.5 31.4 10v16L18 33.5 4.6 26V10Z" fill="currentColor" /><path d="M12.7 13.8h11M12.7 18.4h11M16.8 11.5v13" stroke="#fff9e9" strokeWidth="3.2" strokeLinecap="round" /><circle cx="24" cy="24" r="2" fill="#fff9e9" /></svg></span>;
}

function Joystick({ onChange }: { onChange: (value: { x: number; z: number }) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (active.current !== event.pointerId) return;
    const box = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - box.left - box.width / 2) / 34;
    const dy = (event.clientY - box.top - box.height / 2) / 34;
    const length = Math.max(1, Math.hypot(dx, dy));
    const x = dx / length, y = dy / length;
    setKnob({ x: x * 24, y: y * 24 }); onChange({ x, z: y });
  }
  function release() { active.current = null; setKnob({ x: 0, y: 0 }); onChange({ x: 0, z: 0 }); }
  useEffect(() => {
    const reset = () => { active.current = null; setKnob({ x: 0, y: 0 }); onChange({ x: 0, z: 0 }); };
    window.addEventListener('blur', reset); document.addEventListener('visibilitychange', reset);
    return () => { window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset); onChange({ x: 0, z: 0 }); };
  }, [onChange]);
  return <div className="joystick-area"><div className="joystick" role="group" aria-label="Joystick untuk berjalan" onPointerDown={event => { active.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event); }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}><span className="joystick-cross">✧</span><span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div><span>Jalan-jalan</span></div>;
}

export default function Game() {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [joinCode, setJoinCode] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'online' | 'connecting'>('online');
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState('');
  const [now, setNow] = useState(Date.now());
  const [movement, setMovement] = useState({ x: 0, z: 0 });
  const [playersOpen, setPlayersOpen] = useState(false);
  const current = useRef<Snapshot | null>(null);
  const clockOffset = useRef(0);
  const pollInFlight = useRef(false);
  const movementInFlight = useRef(false);
  const queuedMove = useRef<{ x: number; z: number } | null>(null);
  const requestId = useRef('');
  const lastTurn = useRef('');
  const beforeHelp = useRef<HTMLElement | null>(null);

  const apply = useCallback((next: Snapshot) => {
    if (current.current && current.current.code === next.code && next.version < current.current.version) return;
    if (current.current?.code === next.code && next.version === current.current.version && next.serverNow < current.current.serverNow) return;
    clockOffset.current = next.serverNow - Date.now(); setNow(next.serverNow);
    current.current = next; setSnapshot(next); setConnection('online');
    window.localStorage.setItem('mathbee-room', next.code);
  }, []);

  useEffect(() => {
    setName(window.localStorage.getItem('mathbee-name') || '');
    const savedAvatar = Number(window.localStorage.getItem('mathbee-avatar') || 0);
    setAvatar(Number.isInteger(savedAvatar) && savedAvatar >= 0 && savedAvatar < AVATARS.length ? savedAvatar : 0);
    const invite = new URL(window.location.href).searchParams.get('room')?.trim().toUpperCase().slice(0, 8) || '';
    if (invite) { setJoinCode(invite); setMode('join'); }
    let mounted = true;
    api<{ player: Guest | null }>('/api/session').then(async ({ player }) => {
      if (!mounted || !player) return;
      setName(player.name); setAvatar(player.avatar);
      const savedRoom = window.localStorage.getItem('mathbee-room');
      const restoreCode = invite || savedRoom;
      if (restoreCode) {
        try {
          const data = await api<{ snapshot: Snapshot }>(`/api/rooms/${encodeURIComponent(restoreCode)}`);
          if (mounted && !current.current) apply(data.snapshot);
        } catch (failure) {
          // An invite may belong to another room. Its membership failure must not
          // erase a different saved room, and temporary outages must remain retryable.
          if (mounted && savedRoom === restoreCode && failure instanceof ApiFailure && [401, 403, 404, 410].includes(failure.status)) {
            window.localStorage.removeItem('mathbee-room');
          }
        }
      }
    }).catch(() => undefined);
    const timer = window.setInterval(() => setNow(Date.now() + clockOffset.current), 100);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [apply]);

  useEffect(() => {
    if (!snapshot?.code) return;
    const code = snapshot.code;
    let mounted = true;
    async function poll() {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        const data = await api<{ snapshot: Snapshot }>(`/api/rooms/${encodeURIComponent(code)}`);
        if (mounted && current.current?.code === code) apply(data.snapshot);
      } catch { if (mounted) setConnection('connecting'); }
      finally { pollInFlight.current = false; }
    }
    const timer = window.setInterval(poll, 1000);
    const resume = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { mounted = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [snapshot?.code, apply]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const room = current.current;
      const point = queuedMove.current;
      if (!room || !point || movementInFlight.current) return;
      queuedMove.current = null; movementInFlight.current = true;
      try {
        const data = await api<{ snapshot: Snapshot }>(`/api/rooms/${room.code}`, { action: 'move', x: point.x, z: point.z });
        if (current.current?.code === room.code) apply(data.snapshot);
      } catch { /* The next position update or state poll reconciles movement. */ }
      finally { movementInFlight.current = false; }
    }, 600);
    return () => window.clearInterval(timer);
  }, [apply]);

  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.turnId !== lastTurn.current) {
      lastTurn.current = snapshot.turnId; setAnswer(''); setPending(false);
      requestId.current = crypto.randomUUID(); setError('');
    }
    if (snapshot.yourAnswer?.submitted) { setAnswer(snapshot.yourAnswer.value || ''); setPending(false); }
  }, [snapshot?.turnId, snapshot?.yourAnswer?.submitted, snapshot?.yourAnswer?.value]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(''), 6500);
    return () => window.clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    if (!help) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handle(event: KeyboardEvent) {
      if (event.key === 'Escape') { setHelp(false); return; }
      if (event.key !== 'Tab') return;
      const controls = document.querySelectorAll<HTMLElement>('.help-modal button, .help-modal [tabindex="0"]');
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handle); beforeHelp.current?.focus(); };
  }, [help]);

  function openHelp() { beforeHelp.current = document.activeElement as HTMLElement | null; setHelp(true); }

  const you = snapshot?.players.find(player => player.id === snapshot.youId);
  const actor = snapshot?.players.find(player => player.id === snapshot.actorId);
  const isCompetitor = snapshot?.yourRole ? snapshot.yourRole === 'competitor' : snapshot?.actorId === snapshot?.youId || snapshot?.phase === 'tiebreak' && snapshot.tiebreakPlayers?.includes(snapshot.youId);
  const answering = snapshot?.phase === 'answering' || snapshot?.phase === 'tiebreak';
  const remaining = snapshot?.deadlineAt ? Math.max(0, snapshot.deadlineAt - now) : 0;
  const inputLocked = !answering || remaining <= 0 || pending || !!snapshot?.yourAnswer?.submitted || connection !== 'online';
  const seconds = Math.ceil(remaining / 1000);
  const orderedPlayers = [...(snapshot?.players || [])].sort((a, b) => b.score - a.score);
  const aborted = snapshot?.phase === 'results' && (snapshot.endReason === 'aborted' || snapshot.winners.length === 0);

  async function action(body: Record<string, unknown>) {
    const room = current.current;
    if (!room) return;
    const data = await api<{ snapshot: Snapshot }>(`/api/rooms/${room.code}`, body);
    if (current.current?.code === room.code) apply(data.snapshot);
    return data.snapshot;
  }

  async function enterRoom(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const nickname = name.trim();
    if (nickname.length < 2) { setError('Tulis nama panggilan, minimal 2 karakter.'); return; }
    if (mode === 'join' && joinCode.trim().length < 4) { setError('Masukkan kode room dari temanmu.'); return; }
    setBusy(true); setError('');
    try {
      const identity = await api<{ player: Guest }>('/api/session', { name: nickname, avatar });
      setName(identity.player.name); setAvatar(identity.player.avatar);
      window.localStorage.setItem('mathbee-name', nickname);
      window.localStorage.setItem('mathbee-avatar', String(avatar));
      const data = await api<{ snapshot: Snapshot }>('/api/rooms', { action: mode, ...(mode === 'join' ? { code: joinCode.trim().toUpperCase() } : {}) });
      apply(data.snapshot);
      const url = new URL(window.location.href); url.searchParams.set('room', data.snapshot.code); window.history.replaceState({}, '', url);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Room belum bisa dibuka. Coba lagi.'); }
    finally { setBusy(false); }
  }

  const submit = useCallback(async () => {
    const room = current.current;
    if (!room || pending || !answer.trim() || room.yourAnswer?.submitted || !['answering', 'tiebreak'].includes(room.phase)) return;
    setPending(true); setError('');
    try {
      const data = await api<{ snapshot: Snapshot }>(`/api/rooms/${room.code}`, { action: 'answer', value: answer, turnId: room.turnId, requestId: requestId.current || (requestId.current = crypto.randomUUID()) });
      if (current.current?.code === room.code) apply(data.snapshot);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Jawaban belum terkonfirmasi. Tunggu pembaruan room.'); }
    finally { setPending(false); }
  }, [answer, pending, apply]);

  function key(value: string) {
    if (inputLocked) return;
    if (value === '⌫') setAnswer(previous => previous.slice(0, -1));
    else if (value === 'C') setAnswer('');
    else setAnswer(previous => (previous + value.replace('−', '-')).slice(0, 48));
  }

  useEffect(() => {
    if (!answering || help) return;
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement && event.target.name !== 'mathbee-answer') return;
      if (/^[0-9/.,\-]$/.test(event.key)) { event.preventDefault(); if (!inputLocked) setAnswer(previous => (previous + event.key).slice(0, 48)); }
      if (event.key === 'Backspace') { event.preventDefault(); if (!inputLocked) setAnswer(previous => previous.slice(0, -1)); }
      if (event.key === 'Delete') { event.preventDefault(); if (!inputLocked) setAnswer(''); }
      if (event.key === 'Enter') { event.preventDefault(); if (!inputLocked) void submit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [answering, inputLocked, help, submit]);

  async function start() { setBusy(true); try { await action({ action: 'start' }); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  async function leave() {
    try { await action({ action: 'leave' }); } catch { /* Local exit remains available if connectivity is gone. */ }
    current.current = null; setSnapshot(null); queuedMove.current = null; setMovement({ x: 0, z: 0 }); setError('');
    window.localStorage.removeItem('mathbee-room'); window.history.replaceState({}, '', window.location.pathname);
  }
  async function share() {
    if (!snapshot) return;
    try {
      const invite = `${window.location.origin}${window.location.pathname}?room=${snapshot.code}`;
      await navigator.clipboard.writeText(invite); setCopied(true); window.setTimeout(() => setCopied(false), 2200);
    } catch { setError(`Kode room kamu: ${snapshot.code}. Bagikan ke temanmu.`); }
  }

  const canWalk = !!snapshot && !help && snapshot.phase !== 'results' && !(snapshot.actorId === snapshot.youId && ['transition', 'answering', 'feedback'].includes(snapshot.phase));
  const roleText = snapshot?.phase === 'tiebreak' ? isCompetitor ? 'Giliran penentuanmu!' : 'Babak penentuan' : isCompetitor ? 'Ini panggungmu!' : 'Latihan sambil menonton';

  return <main className={`math-bee-app ${snapshot ? 'in-room' : 'landing'} ${snapshot?.phase === 'lobby' ? 'is-lobby' : ''} ${answering ? 'is-answering' : ''}`}>
    <div className="world-shell" aria-label="Arena taman Math Bee tiga dimensi"><World players={snapshot?.players || []} youId={snapshot?.youId} actorId={snapshot?.actorId} phase={snapshot?.phase || 'welcome'} controlsEnabled={canWalk} movement={canWalk ? movement : { x: 0, z: 0 }} onMove={(x, z) => { if (snapshot) queuedMove.current = { x, z }; }} /></div>
    <header className="topbar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (!snapshot) window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Math Bee"><BeeMark /><span>math<span className="brand-bee">bee</span><span className="brand-dot">.</span></span></a>
      {snapshot ? <div className="room-top-info"><span className="room-code-label">ROOM <strong>{snapshot.code}</strong></span><span className={`connection-dot ${connection}`} title={connection === 'online' ? 'Tersambung' : 'Menyambungkan kembali'}>{connection === 'online' ? <Wifi size={14} /> : <WifiOff size={14} />}</span></div> : <span className="grade-pill"><BookOpen size={14} /> Kelas 7 SMP</span>}
      <div className="topbar-actions"><button className="icon-button help-button" onClick={openHelp} aria-label="Cara bermain"><HelpCircle size={20} /></button>{snapshot && <button className="icon-button exit-button" onClick={() => void leave()} aria-label="Keluar room"><LogOut size={19} /></button>}</div>
    </header>

    {!snapshot ? <section className="welcome-layout">
      <div className="welcome-copy"><span className="eyebrow"><span /> TEMPAT HITUNGAN JADI KESERUAN</span><h1>Panggung kecil.<br />Tantangan <span>besar<svg viewBox="0 0 220 12"><path d="M3 8Q110-3 216 6" /></svg></span><span className="hero-period">.</span></h1><p>Naik panggung, pecahkan soal, dan jadi juara.<br />Matematika lebih seru kalau main bareng.</p></div>
      <div className="welcome-card"><div className="card-heading"><span className="mini-spark"><Sparkles size={19} /></span><div><h2>Siap unjuk hitungan?</h2><p>Ajak temanmu. Panggung sudah menunggu.</p></div></div>
        <form onSubmit={enterRoom}>
          <label className="field-label" htmlFor="nickname">Nama panggilanmu</label><input id="nickname" className="name-input" autoComplete="nickname" maxLength={16} value={name} onChange={event => setName(event.target.value)} placeholder="Misalnya, Raka" required minLength={2} />
          <div className="avatar-label-row"><span className="field-label">Pilih teman panggungmu</span><span>{AVATARS[avatar]?.name || 'Coral'}</span></div>
          <div className="avatar-picker" aria-label="Pilihan avatar">{AVATARS.map((preset, index) => <button key={preset.name} type="button" className={`avatar-option ${avatar === index ? 'selected' : ''}`} onClick={() => setAvatar(index)} aria-label={`Pilih avatar ${preset.name}`} aria-pressed={avatar === index}><Face avatar={index} />{avatar === index && <span className="avatar-check"><Check size={9} strokeWidth={4} /></span>}</button>)}</div>
          <div className="room-tabs"><button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}><Sparkles size={15} /> Buat room</button><button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}><Users size={15} /> Gabung teman</button></div>
          {mode === 'join' && <label className="code-input-label"><span className="sr-only">Kode room teman</span><input aria-label="Kode room teman" className="code-input" value={joinCode} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="KODE ROOM" onChange={event => setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} /></label>}
          <button className="primary-button enter-button" disabled={busy || name.trim().length < 2 || mode === 'join' && joinCode.trim().length < 4} type="submit">{busy ? <><LoaderCircle className="spin" size={18} /> Menyiapkan panggung…</> : <>{mode === 'create' ? 'Buat room baru' : 'Masuk ke room'}<ArrowRight size={20} /></>}</button>
        </form>
        <p className="card-footnote"><span className="tiny-check"><Check size={11} /></span> Tanpa akun. Langsung main.</p>
      </div>
      <div className="world-caption"><span className="live-dot" /><span>SELAMAT DATANG DI <strong>NUMBER GARDEN</strong></span><Sparkles size={14} /></div>
      <footer className="welcome-footer"><span><Users size={16} /> 4–8 teman</span><i /><span><Heart size={15} /> 3 nyawa</span><i /><span><FlagIcon /> 4 ronde</span><button onClick={openHelp}>Cara main <ChevronRight size={13} /></button></footer>
    </section> : <>
      <div className="match-heading"><span className="match-eyebrow">NUMBER GARDEN</span><h1>{snapshot.phase === 'lobby' ? 'Kumpulkan gengmu.' : snapshot.phase === 'results' ? 'Panggung para juara.' : snapshot.phase === 'tiebreak' ? 'Satu soal. Satu penentuan.' : `Ronde ${snapshot.round} dari ${snapshot.maxRounds}`}</h1><p>{snapshot.phase === 'lobby' ? 'Semua siap? Saatnya naik panggung.' : snapshot.phase === 'transition' ? `${actor?.name || 'Pemain berikutnya'} menuju panggung…` : snapshot.phase === 'results' ? 'Setiap hitungan adalah langkah maju.' : actor ? `${actor.name} sedang di panggung` : 'Tunjukkan hitungan terbaikmu.'}</p></div>
      <button className="mobile-players-button" onClick={() => setPlayersOpen(!playersOpen)}><Users size={17} /> {snapshot.players.length} pemain <span>{you?.score || 0} poin</span></button>
      <aside className={`scoreboard ${playersOpen ? 'mobile-open' : ''}`}><div className="scoreboard-header"><span><Trophy size={15} /> {snapshot.phase === 'lobby' ? 'Teman satu room' : 'Papan skor'}</span><span className="count-badge">{snapshot.players.length}/8</span></div><div className="scoreboard-list">{orderedPlayers.map((player, index) => <div className={`player-row ${player.id === snapshot.actorId ? 'current-player' : ''} ${player.id === snapshot.youId ? 'you-player' : ''} ${player.forfeited ? 'forfeited' : ''}`} key={player.id}><span className="player-rank">{snapshot.phase === 'lobby' ? <span className={`player-status ${player.connected ? 'connected' : ''}`} /> : index + 1}</span><Face avatar={player.avatar} small /><div className="player-details"><strong>{player.name}{player.id === snapshot.youId && <span className="you-tag">kamu</span>}</strong><span className="player-hearts" aria-label={`${player.lives} nyawa`}>{[0, 1, 2].map(heart => <Heart key={heart} size={10} fill={heart < player.lives ? 'currentColor' : 'none'} className={heart >= player.lives ? 'empty-heart' : ''} />)}{!player.connected && <span className="offline-label">koneksi…</span>}</span></div><b className="player-score">{player.score}</b></div>)}</div>{snapshot.phase !== 'lobby' && <div className="scoreboard-foot"><span className="mini-dot" /> Benar +100 · bonus hingga +20</div>}</aside>

      {snapshot.phase === 'lobby' && <section className="lobby-panel game-panel"><span className="panel-eyebrow"><span className="live-dot" /> ROOM PRIVAT</span><h2>Temanmu tinggal<br />masukkan kode ini.</h2><button className="big-room-code" onClick={() => void share()} title="Salin tautan undangan"><span>{snapshot.code}</span>{copied ? <Check size={21} /> : <Copy size={21} />}</button><button className="share-button" onClick={() => void share()}>{copied ? <><Check size={16} /> Tautan tersalin!</> : <><Share2 size={16} /> Salin undangan</>}</button><div className="waiting-message"><div className="waiting-orbit"><Users size={21} /></div><div><strong>{snapshot.players.length < 4 ? `Menunggu ${4 - snapshot.players.length} teman lagi` : 'Gengmu sudah siap!'}</strong><p>{snapshot.players.length < 4 ? 'Minimal 4 pemain untuk mulai.' : 'Bisa bermain hingga 8 pemain.'}</p></div></div>{snapshot.hostId === snapshot.youId ? <button className="primary-button" disabled={snapshot.players.length < 4 || busy} onClick={() => void start()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} fill="currentColor" />} Mulai pertandingan<ArrowRight size={18} /></button> : <div className="waiting-host"><LoaderCircle size={15} className="spin" /> Menunggu host memulai</div>}<p className="lobby-tip">Sambil menunggu, coba jalan-jalan di taman.</p></section>}

      {snapshot.phase === 'transition' && <div className="stage-announcement"><span className="announcement-icon"><Sparkles size={24} /></span><span>GILIRAN BERIKUTNYA</span><strong>{actor?.name || 'Bersiap…'}</strong><p>{snapshot.actorId === snapshot.youId ? 'Tarik napas. Kamu pasti bisa!' : 'Siapkan hitunganmu juga.'}</p></div>}

      {answering && snapshot.question && <section className={`question-panel game-panel ${isCompetitor ? 'your-turn' : 'practice-turn'}`} aria-label={isCompetitor ? 'Soal giliranmu' : 'Latihan privat penonton'}>
        <div className="question-topline"><span className="role-badge">{isCompetitor ? <Sparkles size={13} /> : <BookOpen size={13} />}{roleText}</span><span className={`timer-pill ${seconds <= 7 ? 'urgent' : ''}`} aria-label={`${seconds} detik tersisa`}><Clock3 size={15} />{seconds}<small>d</small></span></div>
        <div className="timer-track"><span style={{ width: `${Math.min(100, remaining / 300)}%` }} /></div>
        <span className="question-topic">{snapshot.question.topic}</span><h2 className={`math-question ${snapshot.question.prompt.length > 60 ? 'story-question' : ''}`}>{snapshot.question.prompt}</h2>
        <p className="answer-instruction">{isCompetitor ? 'Hitung, lalu kunci jawabanmu.' : 'Jawabanmu privat. Tidak memengaruhi skor.'}</p>
        <div className={`answer-box ${snapshot.yourAnswer?.submitted ? 'is-locked' : ''}`}><input name="mathbee-answer" aria-label="Jawaban matematika" readOnly inputMode="none" value={answer} placeholder="Ketik jawabanmu" /><button disabled={inputLocked || !answer} onClick={() => key('⌫')} aria-label="Hapus satu karakter"><BackspaceIcon /></button></div>
        {snapshot.yourAnswer?.submitted ? <div className="answer-locked"><CheckCircle2 size={23} /><strong>Jawaban terkunci!</strong><p>{isCompetitor ? 'Menunggu hasil hitunganmu…' : 'Hasil latihanmu muncul saat pembahasan.'}</p></div> : <><div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', ','].map(value => <button key={value} disabled={inputLocked} onClick={() => key(value)} className={value === '−' || value === ',' ? 'symbol-key' : ''}>{value}</button>)}</div><div className="keypad-tools"><button disabled={inputLocked} onClick={() => key('/')}><span>⁄</span> Pecahan</button><span>Contoh: 1/2 atau 0,5</span><button disabled={inputLocked || !answer} onClick={() => key('C')}>Reset</button></div><button className="primary-button lock-button" disabled={inputLocked || !answer.trim()} onClick={() => void submit()}>{pending ? <><LoaderCircle className="spin" size={18} /> Mengunci…</> : <>Kunci {isCompetitor ? 'jawaban' : 'latihan'}<ArrowRight size={19} /></>}</button></>}
      </section>}

      {snapshot.phase === 'feedback' && snapshot.feedback && <section className={`feedback-panel game-panel ${snapshot.feedback.actorCorrect ? 'correct-feedback' : ''}`} aria-live="polite"><div className="feedback-title"><span className="feedback-icon">{snapshot.feedback.actorCorrect ? <CheckCircle2 size={26} /> : <BookOpen size={25} />}</span><div><span className="panel-eyebrow">WAKTUNYA MEMAHAMI</span><h2>{snapshot.feedback.actorCorrect ? 'Hitungan yang mantap!' : 'Yuk, lihat caranya.'}</h2></div>{snapshot.feedback.actorCorrect && <span className="score-delta">+{snapshot.feedback.delta}</span>}</div><div className="solution-answer"><span>Jawaban yang benar</span><strong>{snapshot.feedback.answer}</strong></div><ol className="solution-steps">{snapshot.feedback.steps.map((step, index) => <li key={index}><span>{index + 1}</span>{step}</li>)}</ol>{snapshot.feedback.yours?.submitted && <div className={`private-result ${snapshot.feedback.yours.correct ? 'right' : 'wrong'}`}>{snapshot.feedback.yours.correct ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{snapshot.feedback.yours.correct ? 'Jawabanmu benar. Kerja bagus!' : `Jawabanmu ${snapshot.feedback.yours.value}. Coba lagi di soal berikutnya.`}</span></div>}<div className="next-turn-label"><LoaderCircle className="spin" size={14} /> Giliran berikutnya segera dimulai</div></section>}

      {snapshot.phase === 'results' && <section className="results-panel game-panel">{!aborted && <div className="result-confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--i': index } as React.CSSProperties} />)}</div>}<span className={`trophy-medallion ${aborted ? 'neutral-medallion' : ''}`}>{aborted ? <Users size={34} strokeWidth={1.6} /> : <Trophy size={36} strokeWidth={1.6} />}</span><span className="panel-eyebrow">PERTANDINGAN SELESAI</span><h2>{aborted ? 'Pertandingan berakhir' : snapshot.winners.length > 1 ? 'Juara bersama!' : 'Panggung punya juara!'}</h2><div className="winner-avatars">{snapshot.winners.map(id => { const winner = snapshot.players.find(player => player.id === id); return winner ? <div key={id}><Face avatar={winner.avatar} /><strong>{winner.name}</strong></div> : null; })}</div><p className="results-subtitle">{aborted ? 'Semua peserta sudah keluar. Kumpulkan teman untuk bermain lagi.' : snapshot.winners.includes(snapshot.youId) ? 'Keren! Hitunganmu bersinar hari ini.' : 'Terus mencoba. Giliranmu bersinar berikutnya.'}</p>{!aborted && <p className="result-reason">{({ 'last-survivor': 'Satu pemain bertahan setelah ronde selesai.', 'all-eliminated': 'Semua nyawa habis. Skor tertinggi menentukan hasil.', 'round-limit': 'Empat ronde selesai. Skor tertinggi menjadi juara.', 'tiebreak': 'Juara ditentukan melalui satu soal penentuan.', 'shared-champions': 'Penentuan berakhir tanpa satu pemenang tunggal.', 'aborted': 'Tidak ada peserta yang memenuhi syarat untuk melanjutkan.' } as Record<string, string>)[snapshot.endReason || ''] || 'Hasil pertandingan telah dikunci.'}</p>}<div className="result-score"><span>Skor kamu</span><strong>{you?.score || 0}<small> poin</small></strong></div><div className="results-actions">{snapshot.hostId === snapshot.youId ? <button className="primary-button" disabled={busy} onClick={async () => { setBusy(true); try { await action({ action: 'rematch' }); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}><RotateCcw size={17} /> Main lagi<ArrowRight size={18} /></button> : <span className="rematch-host">Tunggu host untuk bermain lagi.</span>}<button className="text-button" onClick={() => void leave()}><ArrowLeft size={15} /> Kembali ke taman</button></div></section>}

      {canWalk && <Joystick onChange={setMovement} />}
      {snapshot.phase !== 'answering' && snapshot.phase !== 'tiebreak' && snapshot.phase !== 'results' && <div className="emote-bar" aria-label="Pesan siap pakai">{[{ id: 'cheer', icon: '✦', text: 'Semangat!' }, { id: 'nice', icon: '♡', text: 'Mantap!' }, { id: 'again', icon: '↻', text: 'Main lagi?' }].map(emote => <button key={emote.id} onClick={() => void action({ action: 'emote', emoteId: emote.id }).catch(failure => setError(failure.message))}><span>{emote.icon}</span>{emote.text}</button>)}</div>}
      <div className="emote-feed" aria-live="polite">{snapshot.emotes.filter(emote => now - emote.at < 4500).slice(-3).map(emote => <div className="emote-bubble" key={emote.id}><strong>{snapshot.players.find(player => player.id === emote.playerId)?.name}</strong> {emote.text}</div>)}</div>
      {connection !== 'online' && <div className="connection-banner" role="status"><WifiOff size={16} /><span>Menyambungkan kembali… Timer pertandingan tetap berjalan.</span></div>}
    </>}

    {error && <div className="error-toast" role="alert"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Tutup pesan"><X size={16} /></button></div>}
    {help && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setHelp(false); }}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="modal-close icon-button" autoFocus onClick={() => setHelp(false)} aria-label="Tutup cara bermain"><X size={21} /></button><span className="help-star"><Sparkles size={27} /></span><span className="panel-eyebrow">ANGKA SAMA, KESERUAN BERBEDA</span><h2 id="help-title">Begini cara mainnya.</h2><div className="help-rule"><span>01</span><div><strong>Kumpulkan 4–8 teman.</strong><p>Buat room dan bagikan kodenya. Tidak perlu akun.</p></div></div><div className="help-rule"><span>02</span><div><strong>Naik panggung bergiliran.</strong><p>Jawab soal bilangan bulat dan pecahan dalam 30 detik. Ketik pecahan seperti 1/2 atau desimal seperti 0,5.</p></div></div><div className="help-rule"><span>03</span><div><strong>Jaga tiga nyawamu.</strong><p>Benar mendapat 100 poin dan bonus kecepatan hingga 20. Salah atau waktu habis mengurangi satu nyawa.</p></div></div><div className="help-rule"><span>04</span><div><strong>Semua tetap ikut berpikir.</strong><p>Sambil menonton, jawab secara privat. Setelah tiap giliran, pelajari pembahasannya selama 5 detik.</p></div></div><div className="help-rule"><span>05</span><div><strong>Empat ronde, satu panggung juara.</strong><p>Pertandingan selesai maksimal 4 ronde. Skor tertinggi seri? Satu soal bersama menentukan juaranya.</p></div></div><button className="primary-button" onClick={() => setHelp(false)}>Siap main!<ArrowRight size={18} /></button></section></div>}
  </main>;
}

function BackspaceIcon() { return <svg width="21" height="19" viewBox="0 0 24 20" fill="none" aria-hidden="true"><path d="m8 2-6 8 6 8h13V2H8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m12 7 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function FlagIcon() { return <svg width="15" height="16" viewBox="0 0 16 18" fill="none" aria-hidden="true"><path d="M3 16V2m0 0c4-3 6 3 10 0v8c-4 3-6-3-10 0" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>; }
