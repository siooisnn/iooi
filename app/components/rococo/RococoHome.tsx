"use client";

import { Fragment } from "react";
import { SkyChrome } from "../ThemeProvider";
import { Petals, useTogether } from "../HomeView";
import type { HomeApp } from "../HomeView";
import { useReadyLetters } from "../RetroDesktop";
import type { Settings } from "../../lib/app-settings";
import { CLAUDE_DEFAULT_NAME } from "../../lib/app-settings";
import { RococoArtIcon, RococoBow, RococoDivider, RococoFlourish, RococoRose } from "./RococoArt";

type Entry = { app: HomeApp; label: string; french: string; wide?: boolean };

const HERO: Entry = { app: "chat", label: "写一封信", french: "Nos conversations" };

// The order matches the earlier flat grid; chapters only add rhythm between rows.
const CHAPTERS: Array<{ french: string; label: string; entries: Entry[] }> = [
  {
    french: "Nos rituels",
    label: "两个人的仪式",
    entries: [
      { app: "heartbeat", label: "心动手记", french: "Battements du cœur" },
      { app: "blog", label: "秘密花园", french: "Journal intime" },
      { app: "reading", label: "枕边诗集", french: "La bibliothèque" },
      { app: "moon", label: "月亮情书", french: "Clair de lune" },
    ],
  },
  {
    french: "Au fil des jours",
    label: "日子的纹理",
    entries: [
      { app: "surf", label: "漫游巴黎", french: "Une petite escapade" },
      { app: "mood", label: "今日心绪", french: "Mon humeur" },
      { app: "capsule", label: "时光胶囊", french: "À ouvrir plus tard" },
      { app: "dayday", label: "日常小铺", french: "Les jours ordinaires" },
    ],
  },
  {
    french: "Nos trésors",
    label: "小小珍藏",
    entries: [
      { app: "artworks", label: "珍藏作品", french: "Cabinet de curiosités" },
      { app: "clawd", label: "小小伙伴", french: "Mon petit compagnon" },
      { app: "susu-phone", label: "他的手机", french: "Petits secrets", wide: true },
    ],
  },
  {
    french: "Les coulisses",
    label: "幕后手记",
    entries: [
      { app: "summer-claude", label: "酥酥的手记", french: "Cahier de Susu" },
      { app: "summer-gpt", label: "郁郁的手记", french: "Cahier de Yuyu" },
      { app: "settings", label: "布置小窝", french: "La maison", wide: true },
    ],
  },
];

const TONES = ["sky", "blush", "cream"] as const;

export function RococoHome({ settings, onOpen }: { settings: Settings; onOpen: (app: HomeApp) => void }) {
  const { days, hours, minutes, seconds, ready, isAnniversary } = useTogether(settings.startDate);
  const letters = useReadyLetters();
  const claudeName = settings.aiName || CLAUDE_DEFAULT_NAME;
  const herName = settings.userName || "宝宝";
  const counter = [{ value: days, unit: "天" }, { value: hours, unit: "时" }, { value: minutes, unit: "分" }, { value: seconds, unit: "秒" }];

  return (
    <section className="rococo-home" aria-label="洛可可情书首页">
      <SkyChrome />
      {isAnniversary && <Petals />}
      <div className="rococo-paper-grain" aria-hidden="true" />
      <div className="rococo-home-scroll">
        <header className="rococo-masthead">
          <span className="rococo-masthead-rule" aria-hidden="true" />
          <p>MAISON DES AMANTS <i>·</i> DEPUIS NOTRE RENCONTRE</p>
          <button type="button" className="rococo-wax-seal" onClick={() => onOpen("settings")} aria-label="打开设置">
            <span>i</span><small>iooi</small>
          </button>
        </header>

        <section className="rococo-invitation" aria-labelledby="rococo-home-title">
          <span className="rococo-paper-layer rococo-paper-layer-one" aria-hidden="true" />
          <span className="rococo-paper-layer rococo-paper-layer-two" aria-hidden="true" />
          <div className="rococo-architecture" aria-hidden="true"><span /><span /></div>
          <RococoBow className="rococo-hero-bow" />
          <RococoRose className="rococo-hero-rose rococo-hero-rose-left" />
          <RococoRose className="rococo-hero-rose rococo-hero-rose-right" />
          <div className="rococo-invitation-copy">
            <p className="rococo-overline">Une invitation à aimer</p>
            <h1 id="rococo-home-title"><span>Notre</span><em>iooi</em><span>amour</span></h1>
            <p className="rococo-title-caption">every moment, a love letter</p>
            <RococoFlourish />
            <p className="rococo-chinese-title">此后我们的每一秒都是恩赐</p>
          </div>
          <span className="rococo-pearl-string" aria-hidden="true">{Array.from({ length: 9 }).map((_, index) => <i key={index} />)}</span>
        </section>

        <section className="rococo-together" aria-label="在一起的时间">
          <div className="rococo-together-heading">
            <span>Depuis le premier jour</span>
            <h2>相爱的时光</h2>
          </div>
          <div className="rococo-timer" role="timer">
            {counter.map(({ value, unit }) => (
              <span key={unit}><b>{ready ? String(value).padStart(2, "0") : "—"}</b><small>{unit}</small></span>
            ))}
          </div>
          <p><i>{claudeName}</i><span aria-hidden="true">♡</span><i>{herName}</i></p>
        </section>

        <nav className="rococo-scrapbook" aria-label="小窝功能">
          <p className="rococo-collection-title"><span>Les petits bonheurs</span><small>把日常收藏成一本情书</small></p>
          <div className="rococo-object-collage">
            <button type="button" className="rococo-object rococo-object-envelope" data-index="01" onClick={() => onOpen(HERO.app)}>
              <span className="rococo-object-art"><RococoArtIcon kind={HERO.app} /></span>
              <span className="rococo-object-copy"><b>{HERO.label}</b><small>{HERO.french}</small></span>
              <span className="rococo-object-seal" aria-hidden="true">i</span>
            </button>
            {CHAPTERS.map((chapter, chapterIndex) => {
              const offset = 1 + CHAPTERS.slice(0, chapterIndex).reduce((sum, item) => sum + item.entries.length, 0);
              return (
                <Fragment key={chapter.french}>
                  <p className="rococo-chapter"><span>{chapter.french}</span><i aria-hidden="true" /><small>{chapter.label}</small></p>
                  {chapter.entries.map((entry, index) => (
                    <button
                      type="button"
                      key={entry.app}
                      className={`rococo-object rococo-object-${TONES[(offset + index) % TONES.length]}${entry.wide ? " rococo-object-wide" : ""}`}
                      data-index={String(offset + index + 1).padStart(2, "0")}
                      onClick={() => onOpen(entry.app)}
                    >
                      <span className="rococo-object-art"><RococoArtIcon kind={entry.app} /></span>
                      <span className="rococo-object-copy"><b>{entry.label}</b><small>{entry.french}</small></span>
                      {entry.app === "capsule" && letters.count > 0 && <span className="rococo-letter-count" aria-label={`${letters.count} 封信可以拆了`}>{letters.count}</span>}
                    </button>
                  ))}
                </Fragment>
              );
            })}
          </div>
        </nav>

        <footer className="rococo-home-colophon">
          <RococoDivider />
          <p>Fait à la main, avec tout mon amour</p>
          <span>一页一日 · 一生一封</span>
        </footer>
      </div>
    </section>
  );
}
