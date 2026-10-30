"use client";

import { useEffect, useState } from "react";
import { formatStepMs, stepLabel, summarizeSteps, type ReplyStep, type ReplyStepMode } from "../lib/reply-steps";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** Re-render once a second while something is running, inside this component only. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

function StepTime({ step, now }: { step: ReplyStep; now: number }) {
  // A thinking step already says how long in its own label.
  if (step.kind === "think" && step.ms !== undefined) return null;
  const ms = step.ms ?? Math.max(0, now - step.t);
  return <span className="reply-step-time">{formatStepMs(ms)}</span>;
}

function StepList({ steps, now }: { steps: ReplyStep[]; now: number }) {
  return (
    <ol className="reply-steps-list">
      {steps.map((step, index) => (
        <li key={`${step.t}-${index}`} className={`reply-step${step.ms === undefined ? " reply-step-active" : ""}`}>
          <span className="reply-step-dot" aria-hidden />
          <span className="reply-step-label">{stepLabel(step)}</span>
          <StepTime step={step} now={now} />
        </li>
      ))}
    </ol>
  );
}

/** Above a finished reply: a faint line that opens into the step list. */
export function ReplyStepsBlock({ steps, mode }: { steps: ReplyStep[]; mode: ReplyStepMode }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeSteps(steps, mode);
  if (!summary) return null;
  // Only thought, no tools: the line already says everything.
  if (steps.length === 1 && steps[0].kind === "think") {
    return <div className="reply-steps"><span className="reply-steps-summary">{summary}</span></div>;
  }
  return (
    <div className="reply-steps">
      <button type="button" className="reply-steps-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <span className="reply-steps-summary">{summary}</span>
      </button>
      {open && <StepList steps={steps} now={0} />}
    </div>
  );
}

/** Chat, while waiting or streaming: what is finished so far, in one faint line. */
export function ReplyStepsSoFar({ steps }: { steps: ReplyStep[] }) {
  const summary = summarizeSteps(steps.filter((step) => step.ms !== undefined), "chat");
  return summary ? <div className="reply-steps"><span className="reply-steps-summary">{summary}</span></div> : null;
}

/** Chat status bubble: the step running right now, or null before the first one. */
export function activeStepText(steps: ReplyStep[]) {
  const active = [...steps].reverse().find((step) => step.ms === undefined);
  return active ? stepLabel(active) : null;
}

const LIVE_VISIBLE = 6;

/** Work mode status bubble: one step per line, newest last, each with its time. */
export function ReplyStepsLive({ steps }: { steps: ReplyStep[] }) {
  const running = steps.some((step) => step.ms === undefined);
  const now = useNow(running);
  const [showAll, setShowAll] = useState(false);
  const hidden = showAll ? 0 : Math.max(0, steps.length - LIVE_VISIBLE);
  return (
    <div className="reply-steps-live">
      {hidden > 0 && (
        <button type="button" className="reply-steps-more" onClick={() => setShowAll(true)}>前面还有 {hidden} 步</button>
      )}
      <StepList steps={steps.slice(hidden)} now={now} />
    </div>
  );
}
