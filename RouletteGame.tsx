"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, CircleHelp, RotateCcw, Undo2, X } from "lucide-react";
import "./roulette.css";

export type BetKind = "number" | "red" | "black" | "even" | "odd";
export type RouletteBet = { kind: BetKind; amount: number; number?: number };
type Table = { id: string; name: string; min: number; max: number; kind: string };
type Props = { table: Table; balance: number; onBalanceChange: (amount: number) => void; onClose: () => void; onToast: (message: string) => void };

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const money = (amount: number) => amount.toLocaleString("en-US");
const total = (bets: RouletteBet[]) => bets.reduce((sum, bet) => sum + bet.amount, 0);

export function pocketColor(number: number): "green" | "red" | "black" {
  return number === 0 ? "green" : RED_NUMBERS.has(number) ? "red" : "black";
}

/** Returns the full credit return, including the original stake, for a settled round. */
export function calculatePayout(bets: RouletteBet[], outcome: number): number {
  if (!Number.isInteger(outcome) || outcome < 0 || outcome > 36) return 0;
  return bets.reduce((sum, bet) => {
    if (bet.kind === "number") return sum + (bet.number === outcome ? bet.amount * 36 : 0);
    if (outcome === 0) return sum;
    const won = bet.kind === "red" ? pocketColor(outcome) === "red"
      : bet.kind === "black" ? pocketColor(outcome) === "black"
      : bet.kind === "even" ? outcome % 2 === 0 : outcome % 2 === 1;
    return sum + (won ? bet.amount * 2 : 0);
  }, 0);
}

function randomPocket() {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 37) * 37;
  do { window.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % 37;
}

export default function RouletteGame({ table, balance, onBalanceChange, onClose, onToast }: Props) {
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [chip, setChip] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ number: number; returned: number; staked: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [lastBets, setLastBets] = useState<RouletteBet[]>([]);
  const [showNumbers, setShowNumbers] = useState(true);
  const [help, setHelp] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [announcement, setAnnouncement] = useState("Choose a chip, then choose where to place it.");
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpPanel = useRef<HTMLElement>(null);
  const helpClose = useRef<HTMLButtonElement>(null);
  const helpOpen = useRef(false);
  const helpWasOpened = useRef(false);
  helpOpen.current = help;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const spinningRef = useRef(false);
  const betsRef = useRef<RouletteBet[]>([]);
  const creditsRef = useRef(balance);
  const closeRef = useRef<() => void>(() => {});
  const betTotal = total(bets);

  useEffect(() => { creditsRef.current = balance; }, [balance]);
  useEffect(() => {
    if (help) { helpWasOpened.current = true; helpClose.current?.focus(); }
    else if (helpWasOpened.current) helpButton.current?.focus();
  }, [help]);

  function changeCredits(next: number) {
    creditsRef.current = next;
    onBalanceChange(next);
  }
  function changeBets(next: RouletteBet[]) { betsRef.current = next; setBets(next); }
  function notify(message: string) { setAnnouncement(message); onToast(message); }

  function leave() {
    if (spinningRef.current) return;
    const refund = total(betsRef.current);
    if (refund) { changeCredits(creditsRef.current + refund); changeBets([]); }
    onClose();
  }
  closeRef.current = () => {
    if (help) { setHelp(false); helpButton.current?.focus(); } else leave();
  };

  useEffect(() => {
    mounted.current = true;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (window.matchMedia("(max-width: 620px)").matches) setShowNumbers(false);
    closeButton.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusScope = helpOpen.current ? helpPanel.current : dialog.current;
      if (!focusScope) return;
      const nodes = Array.from(focusScope.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')).filter(node => node.offsetParent !== null);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !focusScope.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !focusScope.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previouslyFocused?.focus();
    };
  }, []);

  function place(kind: BetKind, number?: number) {
    if (spinningRef.current) return;
    if (creditsRef.current < chip) { notify("Not enough play credits for this chip. Choose a smaller chip or reset your session in the lobby."); return; }
    if (total(betsRef.current) + chip > table.max) { notify(`The table maximum is ${money(table.max)} credits per round.`); return; }
    changeCredits(creditsRef.current - chip);
    changeBets([...betsRef.current, { kind, number, amount: chip }]);
    setResult(null);
    setAnnouncement(`${chip} credits on ${kind === "number" ? number : kind}. Total bet ${total(betsRef.current)} credits.`);
  }

  function undo() {
    if (spinningRef.current || !betsRef.current.length) return;
    const last = betsRef.current[betsRef.current.length - 1];
    changeCredits(creditsRef.current + last.amount);
    changeBets(betsRef.current.slice(0, -1));
    setAnnouncement("Last chip returned to your balance.");
  }
  function clear() {
    if (spinningRef.current || !betsRef.current.length) return;
    changeCredits(creditsRef.current + total(betsRef.current));
    changeBets([]);
    setAnnouncement("All chips returned to your balance.");
  }
  function repeat() {
    if (spinningRef.current || betsRef.current.length || !lastBets.length) return;
    const amount = total(lastBets);
    if (amount > creditsRef.current) { notify("Not enough play credits to repeat that bet."); return; }
    if (amount < table.min || amount > table.max) { notify("That bet is outside this table’s limits."); return; }
    changeCredits(creditsRef.current - amount);
    changeBets(lastBets.map(bet => ({ ...bet })));
    setResult(null);
    setAnnouncement(`Last bet repeated. ${amount} credits placed.`);
  }
  function spin() {
    const placed = betsRef.current.map(bet => ({ ...bet }));
    const staked = total(placed);
    if (spinningRef.current || staked < table.min || staked > table.max) return;
    spinningRef.current = true;
    setSpinning(true);
    setResult(null);
    setAnnouncement("Round in progress. Betting is closed.");
    const outcome = randomPocket();
    const finalAngle = (360 - POCKETS.indexOf(outcome) * (360 / 37)) % 360;
    setRotation(previous => Math.floor(previous / 360) * 360 + 1800 + finalAngle);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(() => {
      if (!mounted.current) return;
      const returned = calculatePayout(placed, outcome);
      changeCredits(creditsRef.current + returned);
      changeBets([]);
      setLastBets(placed);
      setHistory(previous => [outcome, ...previous].slice(0, 8));
      setResult({ number: outcome, returned, staked });
      spinningRef.current = false;
      setSpinning(false);
      setAnnouncement(`${outcome}, ${pocketColor(outcome)}. ${returned ? `${returned} credits returned, including winning stakes.` : "No winning bets this round."}`);
    }, reduced ? 350 : 2400);
  }

  function amountOn(kind: BetKind, number?: number) {
    return bets.filter(bet => bet.kind === kind && (kind !== "number" || bet.number === number)).reduce((sum, bet) => sum + bet.amount, 0);
  }
  const net = result ? result.returned - result.staked : 0;

  return (
    <div className="rg-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeRef.current(); }}>
      <section className="rg-dialog" role="dialog" aria-modal="true" aria-labelledby="rg-title" aria-describedby="rg-disclaimer" ref={dialog}>
        <header className="rg-header" inert={help}>
          <button ref={closeButton} className="rg-icon" onClick={leave} disabled={spinning} aria-label="Leave table and return unplayed chips" title={spinning ? "Round in progress" : "Back to lobby"}><ArrowLeft size={20} /></button>
          <div className="rg-title-group"><span className="rg-eyebrow">ORBIT / PRACTICE TABLE</span><h2 id="rg-title">{table.name}</h2></div>
          <button ref={helpButton} className="rg-icon" onClick={() => setHelp(value => !value)} aria-label="Show roulette rules" aria-expanded={help}><CircleHelp size={21} /></button>
          <div className="rg-balance"><span>PLAY BALANCE</span><strong>{money(balance)} <small>CR</small></strong></div>
        </header>

        <div className="rg-body" inert={help}>
          <div className="rg-stage">
            <div className="rg-stage-caption"><span className="rg-status-dot" /> EUROPEAN ROULETTE <span className="rg-table-id">TABLE {table.id.slice(-2).toUpperCase()}</span></div>
            <div className={`rg-wheel-space${spinning ? " rg-is-spinning" : ""}`}>
              <div className="rg-wheel-glow" />
              <svg className="rg-wheel" style={{ transform: `rotate(${rotation}deg)` }} viewBox="0 0 400 400" aria-label="European roulette wheel" role="img">
                <defs><radialGradient id="rg-metal"><stop stopColor="#f4efdc"/><stop offset=".3" stopColor="#8d9292"/><stop offset=".55" stopColor="#edece4"/><stop offset=".76" stopColor="#4a4c50"/><stop offset="1" stopColor="#b9b7b0"/></radialGradient><radialGradient id="rg-felt"><stop stopColor="#393440"/><stop offset="1" stopColor="#18151e"/></radialGradient></defs>
                <circle cx="200" cy="200" r="194" fill="url(#rg-metal)"/><circle cx="200" cy="200" r="186" fill="#1d1a24"/><circle cx="200" cy="200" r="176" fill="none" stroke="#706875" strokeWidth="1"/>
                {POCKETS.map((number, index) => {
                  const angle = index * 360 / 37 - 90;
                  const radians = angle * Math.PI / 180;
                  const x = 200 + 155 * Math.cos(radians); const y = 200 + 155 * Math.sin(radians);
                  const edge = angle - 180 / 37; const next = angle + 180 / 37;
                  const a = edge * Math.PI / 180; const b = next * Math.PI / 180;
                  const path = `M ${200 + 136 * Math.cos(a)} ${200 + 136 * Math.sin(a)} L ${200 + 175 * Math.cos(a)} ${200 + 175 * Math.sin(a)} A 175 175 0 0 1 ${200 + 175 * Math.cos(b)} ${200 + 175 * Math.sin(b)} L ${200 + 136 * Math.cos(b)} ${200 + 136 * Math.sin(b)} A 136 136 0 0 0 ${200 + 136 * Math.cos(a)} ${200 + 136 * Math.sin(a)} Z`;
                  return <g key={number}><path d={path} fill={number === 0 ? "#9caf78" : pocketColor(number) === "red" ? "#925064" : "#292530"} stroke="#a3a090" strokeWidth=".7"/><text x={x} y={y} fill="#fff8ee" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="600" transform={`rotate(${angle + 90} ${x} ${y})`}>{number}</text></g>;
                })}
                <circle cx="200" cy="200" r="132" fill="url(#rg-felt)" stroke="#8c8791" strokeWidth="3"/><circle cx="200" cy="200" r="113" fill="none" stroke="#524c5b" strokeWidth="1"/><circle cx="200" cy="200" r="78" fill="none" stroke="#524c5b" strokeWidth="1"/>
                <path d="M200 200 200 99 M200 200 288 251 M200 200 112 251" stroke="url(#rg-metal)" strokeWidth="9" strokeLinecap="round"/>
                <circle cx="200" cy="200" r="31" fill="url(#rg-metal)"/><circle cx="200" cy="200" r="12" fill="#eee9df"/>
              </svg>
              <div className="rg-ball" aria-hidden="true" />
              <div className="rg-wheel-center" aria-hidden="true">O<span>R</span>B<span>I</span>T</div>
            </div>
            <div className="rg-round-state" aria-hidden="true">
              {spinning ? <><span className="rg-round-label">ROUND IN PROGRESS</span><strong>Let it roll.</strong></> : result ? <><span className="rg-round-label">RESULT / {pocketColor(result.number).toUpperCase()}</span><strong><i className={`rg-result-pocket rg-${pocketColor(result.number)}`}>{result.number}</i>{net > 0 ? `+${money(net)} credits` : net === 0 ? "Even round" : "Next round, your move."}</strong></> : <><span className="rg-round-label">THE TABLE IS YOURS</span><strong>Make your move.</strong></>}
            </div>
            <div className="rg-history"><span>{history.length ? "RECENT" : "YOUR FIRST ROUND STARTS HERE"}</span>{history.map((number, i) => <span key={`${i}-${number}`} className={`rg-history-number rg-${pocketColor(number)}${i === 0 && result ? " rg-latest" : ""}`}>{number}</span>)}</div>
            <p id="rg-disclaimer" className="rg-disclaimer">Simulated table · play credits only</p>
          </div>

          <div className="rg-betting">
            <div className="rg-betting-heading"><h3>{spinning ? "Betting closed" : "Place your chips"}</h3><span>{money(table.min)}–{money(table.max)} CR / round</span></div>
            <div className="rg-chips" role="group" aria-label="Choose chip value">{[1, 5, 10, 25].map(value => <button key={value} className={`rg-chip rg-chip-${value}${chip === value ? " rg-chip-selected" : ""}`} disabled={spinning} aria-pressed={chip === value} aria-label={`${value} credit chip`} onClick={() => setChip(value)}><span>{value}</span></button>)}<span className="rg-chip-caption">CHOOSE<br/>YOUR CHIP</span></div>
            <div className="rg-outside-bets">{(["red", "black", "even", "odd"] as const).map(kind => <button key={kind} disabled={spinning} className={`rg-outside rg-outside-${kind}${amountOn(kind) ? " rg-has-bet" : ""}`} onClick={() => place(kind)} aria-label={`Bet ${chip} credits on ${kind}${amountOn(kind) ? `, ${amountOn(kind)} already placed` : ""}`}><span>{kind === "red" || kind === "black" ? <i className={`rg-diamond rg-${kind}`} /> : null}{kind}</span><small>{amountOn(kind) ? `${amountOn(kind)} CR` : "1:1"}</small></button>)}</div>
            <button className="rg-number-toggle" aria-expanded={showNumbers} aria-controls="rg-numbers" onClick={() => setShowNumbers(value => !value)}><span>Single numbers <small>35:1</small></span><ChevronDown size={16} style={{ transform: showNumbers ? "rotate(180deg)" : "none" }}/></button>
            {showNumbers && <div id="rg-numbers" className="rg-number-grid" role="group" aria-label="Bet on a single number">{Array.from({ length: 37 }, (_, number) => <button disabled={spinning} key={number} className={`rg-number rg-${pocketColor(number)}${number === 0 ? " rg-zero" : ""}${amountOn("number", number) ? " rg-has-bet" : ""}`} onClick={() => place("number", number)} aria-label={`Bet ${chip} credits on number ${number}${amountOn("number", number) ? `, ${amountOn("number", number)} already placed` : ""}`}><span>{number}</span>{amountOn("number", number) > 0 && <small>{amountOn("number", number)}</small>}</button>)}</div>}
            <div className="rg-actions"><button onClick={undo} disabled={spinning || !bets.length}><Undo2 size={15}/>Undo</button><button onClick={clear} disabled={spinning || !bets.length}>Clear</button><button onClick={repeat} disabled={spinning || !!bets.length || !lastBets.length}><RotateCcw size={15}/>Repeat last</button></div>
            <div className="rg-bet-summary"><span>Total bet<strong>{money(betTotal)} <small>CR</small></strong></span><button className="rg-spin" onClick={spin} disabled={spinning || betTotal < table.min || betTotal > table.max}>{spinning ? "Spinning…" : "Spin the wheel"}<ArrowRight size={19}/></button></div>
            <p className="rg-bet-note">{spinning ? "Your bets are locked until this round ends." : betTotal > 0 && betTotal < table.min ? `Add ${table.min - betTotal} more credits to reach the table minimum.` : bets.length ? "Ready when you are. Unplayed chips are returned if you leave." : "Pick a chip and tap a number or an outside bet."}</p>
          </div>
        </div>

        {help && <aside className="rg-help" ref={helpPanel} role="dialog" aria-modal="true" aria-labelledby="rg-help-title"><div className="rg-help-heading"><h3 id="rg-help-title">A little table knowledge.</h3><button ref={helpClose} className="rg-icon" onClick={() => { setHelp(false); helpButton.current?.focus(); }} aria-label="Close roulette rules"><X size={20}/></button></div><p>Choose a chip, place your bets, then spin. This European wheel has 37 pockets: 0–36.</p><dl><div><dt>Single number</dt><dd>35:1 · 36× stake returned</dd></div><div><dt>Red / Black / Even / Odd</dt><dd>1:1 · 2× stake returned</dd></div><div><dt>When zero lands</dt><dd>Only a bet on 0 wins.</dd></div></dl><p>Winning returns include the original stake. Every round is independently simulated. Recent numbers do not predict the next result.</p><p><strong>Play credits have no cash value.</strong> There are no deposits, purchases or withdrawals. This is an interface design prototype.</p></aside>}
        <div className="rg-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      </section>
    </div>
  );
}
