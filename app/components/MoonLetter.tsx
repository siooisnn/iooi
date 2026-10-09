import { useId } from "react";
import styles from "./MoonLetter.module.css";

/** Decorative vector artwork keeps the lettering crisp at phone and desktop sizes. */
export function MoonLetter({ days, hours, minutes, seconds, ready }: {
  days: number; hours: number; minutes: number; seconds: number; ready: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `${id}-${name}`;
  const paint = (name: string) => `url(#${ref(name)})`;
  return (
    <div className={styles.letter}>
      <svg className={styles.sky} viewBox="0 0 380 440" role="img" aria-label="左上方的月亮与右下方的地球，用环绕花体情书的细线相连：I love you to the moon and back">
        <defs>
          <radialGradient id={ref("moon")} cx="30%" cy="25%" r="78%">
            <stop stopColor="#fcfcfc"/><stop offset=".53" stopColor="#ececec"/><stop offset=".85" stopColor="#cbcbcb"/><stop offset="1" stopColor="#a9a9a9"/>
          </radialGradient>
          <radialGradient id={ref("ocean")} cx="28%" cy="22%" r="80%">
            <stop stopColor="#a4a4a4"/><stop offset=".45" stopColor="#767676"/><stop offset=".8" stopColor="#4e4e4e"/><stop offset="1" stopColor="#303030"/>
          </radialGradient>
          <radialGradient id={ref("shade")} cx="28%" cy="22%" r="78%">
            <stop offset=".3" stopColor="#fff" stopOpacity=".25"/><stop offset=".65" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#111111" stopOpacity=".45"/>
          </radialGradient>
          <linearGradient id={ref("thread")} x2="1" y2="1">
            <stop stopColor="#b8b8b8"/><stop offset=".5" stopColor="#c6c6c6"/><stop offset="1" stopColor="#8c8c8c"/>
          </linearGradient>
          <filter id={ref("shadow")} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="3" dy="9" stdDeviation="9" floodColor="#8c8c8c" floodOpacity=".17"/></filter>
          <filter id={ref("soft")}><feGaussianBlur stdDeviation="1.6"/></filter>
          <filter id={ref("cloud")}><feGaussianBlur stdDeviation="2.2"/></filter>
          <clipPath id={ref("earthClip")}><circle cx="291" cy="303" r="55"/></clipPath>
          <path id={ref("words1")} d="M 64 177 Q 168 151 321 206"/>
          <path id={ref("words2")} d="M 58 221 Q 178 193 323 249"/>
        </defs>
        <g fill="#ababab" opacity=".75">
          {[[179,44,3],[294,94,4],[45,265,3],[174,349,3],[329,179,2],[220,127,2]].map(([x,y,r],i) => <path className={styles.star} style={{animationDelay:`${i * -1.7}s`}} key={i} d={`M${x} ${y-r*2} Q${x} ${y} ${x+r*1.3} ${y} Q${x} ${y} ${x} ${y+r*2} Q${x} ${y} ${x-r*1.3} ${y} Q${x} ${y} ${x} ${y-r*2}`} />)}
          {[[133,28],[253,68],[326,130],[52,207],[119,297],[215,360],[350,260],[194,87],[73,333]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r={i%3===0?1.5:1}/>) }
        </g>
        <g fill="none" stroke={paint("thread")} strokeWidth=".9">
          <path d="M63 76 C10 77 24 128 87 126 C137 124 162 147 141 171 C125 190 102 172 118 157 C141 136 175 193 224 203 C263 211 273 188 259 181 C246 174 239 195 259 219 C283 250 210 278 237 316 C247 331 269 331 289 340" opacity=".66"/>
        </g>
        <g transform="translate(-8 -10)">
        <circle cx="79" cy="87" r="43" fill={paint("moon")} filter={paint("shadow")}/>
        <g fill="#a8a8a8" opacity=".24" filter={paint("soft")}>
          <ellipse cx="62" cy="70" rx="12" ry="15" transform="rotate(-30 62 70)"/><ellipse cx="87" cy="92" rx="16" ry="11"/>
          <circle cx="57" cy="99" r="7"/><circle cx="96" cy="65" r="5"/><circle cx="81" cy="117" r="4"/><circle cx="104" cy="104" r="6"/>
        </g>
        <g fill="none" stroke="#ffffff" opacity=".3"><path d="M46 88 A33 33 0 0 1 78 54"/><ellipse cx="63" cy="70" rx="10" ry="13" transform="rotate(-30 63 70)"/></g>
        <g fill="#a5a5a5" opacity=".15">{[[49,79,2],[73,57,3],[89,74,2],[74,101,3],[101,87,2],[66,115,2],[95,114,2],[53,90,1]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r}/>)}</g>
        <path d="M37 89 C7 114 67 144 119 103" fill="none" stroke={paint("thread")} strokeWidth=".85"/>
        </g>
        <text className={styles.script} fill="#7a7a7a"><textPath href={`#${ref("words1")}`} startOffset="4%">I love you to the</textPath></text>
        <text className={styles.script} fill="#7a7a7a"><textPath href={`#${ref("words2")}`} startOffset="9%">moon and back</textPath></text>
        <path d="M140 172 C130 185 117 182 115 172 M254 211 C267 224 269 238 251 255" fill="none" stroke={paint("thread")} strokeWidth="1.1"/>
        <g transform="translate(8 47)">
        <circle cx="291" cy="303" r="58" fill="#e2e2e2" opacity=".5"/>
        <circle cx="291" cy="303" r="55" fill={paint("ocean")} filter={paint("shadow")}/>
        <g clipPath={paint("earthClip")}>
          <g fill="#999999" filter={paint("soft")}>
            <path d="M250 260 Q263 248 277 255 Q281 260 276 265 Q285 268 279 276 Q291 274 293 282 Q286 289 280 286 Q276 289 281 296 Q283 303 277 304 Q270 301 268 291 Q261 287 254 285 Q258 279 247 278 Q241 269 250 260Z"/>
            <path d="M279 303 Q288 305 294 308 Q305 310 301 317 Q296 324 293 327 Q293 339 282 347 Q277 341 282 333 Q278 326 276 320 Q269 312 279 303Z"/>
            <path d="M307 250 Q326 247 339 264 Q337 270 342 275 Q342 285 330 282 Q324 282 325 291 Q321 300 316 291 Q311 286 306 287 Q301 281 310 275 Q317 270 304 266 Q299 257 307 250Z"/>
            <path d="M334 316 Q340 312 344 319 Q351 322 346 330 Q338 336 331 330 Q327 323 334 316Z"/>
          </g>
          <g fill="none" stroke="#fff" strokeLinecap="round" opacity=".6" filter={paint("cloud")}><path d="M244 278 Q267 264 289 280 T342 281 M255 315 Q277 306 300 320 M306 300 Q330 291 346 305" strokeWidth="3"/><path d="M262 341 Q280 352 307 342 M283 257 L299 260" strokeWidth="2"/></g>
          <circle cx="291" cy="303" r="55" fill={paint("shade")}/>
        </g>
        <path d="M238 288 C202 312 268 368 335 324 C357 309 358 295 346 291" fill="none" stroke={paint("thread")} strokeWidth=".9"/>
        </g>
      </svg>
      <div className={styles.keepsake}>
        <p className={styles.promise}>此后我们的每一秒都是恩赐</p>
        <div className={styles.clock} role="timer" aria-label="在一起的时间">
          {[{value:days,unit:"天"},{value:hours,unit:"时"},{value:minutes,unit:"分"},{value:seconds,unit:"秒"}].map(({value,unit}) => (
            <span className={styles.timePart} key={unit}><span className={styles.number}>{ready ? String(value).padStart(2,"0") : "—"}</span><span className={styles.unit}>{unit}</span></span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The desktop widget: just the moon, the earth and the thread between them. */
export function MoonEarthMini() {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `${id}-${name}`;
  const paint = (name: string) => `url(#${ref(name)})`;
  return (
    <svg className={styles.mini} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id={ref("moon")} cx="30%" cy="25%" r="78%">
          <stop stopColor="#fcfcfc"/><stop offset=".53" stopColor="#ececec"/><stop offset=".85" stopColor="#cbcbcb"/><stop offset="1" stopColor="#a9a9a9"/>
        </radialGradient>
        <radialGradient id={ref("ocean")} cx="28%" cy="22%" r="80%">
          <stop stopColor="#a4a4a4"/><stop offset=".45" stopColor="#767676"/><stop offset=".8" stopColor="#4e4e4e"/><stop offset="1" stopColor="#303030"/>
        </radialGradient>
        <filter id={ref("soft")}><feGaussianBlur stdDeviation="1.2"/></filter>
        <clipPath id={ref("earthClip")}><circle cx="140" cy="140" r="40"/></clipPath>
      </defs>
      <g fill="#ababab" opacity=".7">
        {[[150,40,1.4],[176,82,1],[30,150,1.2],[98,100,1],[60,178,1]].map(([x,y,r],i) => <circle key={i} cx={x} cy={y} r={r}/>)}
      </g>
      <path d="M44 86 C30 112 70 120 92 104 C112 90 120 70 106 66 C92 62 92 88 108 104 C122 118 104 132 108 150 C112 166 140 180 160 172"
        fill="none" stroke="#9a9a9a" strokeWidth=".9" opacity=".8"/>
      <circle cx="62" cy="60" r="30" fill={paint("moon")}/>
      <g fill="#a8a8a8" opacity=".25" filter={paint("soft")}>
        <ellipse cx="52" cy="50" rx="8" ry="10" transform="rotate(-30 52 50)"/><ellipse cx="68" cy="66" rx="11" ry="7"/>
        <circle cx="48" cy="72" r="5"/><circle cx="74" cy="46" r="3.5"/>
      </g>
      <circle cx="140" cy="140" r="43" fill="#e2e2e2" opacity=".5"/>
      <circle cx="140" cy="140" r="40" fill={paint("ocean")}/>
      <g clipPath={paint("earthClip")} fill="#999999" filter={paint("soft")}>
        <path d="M112 112 Q122 104 132 109 Q135 113 131 117 Q138 119 133 125 Q142 124 143 130 Q138 135 134 133 Q131 135 134 140 Q136 146 131 146 Q126 144 124 136 Q119 133 114 132 Q117 127 109 126 Q105 119 112 112Z"/>
        <path d="M152 106 Q166 104 175 116 Q174 121 177 124 Q177 131 168 129 Q164 129 164 136 Q162 142 158 136 Q155 132 151 133 Q148 129 154 124 Q159 121 150 118 Q147 111 152 106Z"/>
        <path d="M133 146 Q140 148 144 150 Q152 151 149 157 Q146 162 144 164 Q144 173 136 179 Q132 174 136 168 Q133 163 131 158 Q126 152 133 146Z"/>
      </g>
    </svg>
  );
}
