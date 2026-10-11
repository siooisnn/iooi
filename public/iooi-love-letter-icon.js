export function drawIooiLoveLetter(canvas) {
      canvas.width = 64; canvas.height = 64;
      const variant = "love";
      const options = { love: { flower: true } };
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const r = (x,y,w,h,c) => { ctx.fillStyle=c; ctx.fillRect(x,y,w,h); };
      const poly = (points, color) => {
        const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
        for(let y=Math.min(...ys);y<Math.max(...ys);y++) {
          for(let x=Math.min(...xs);x<Math.max(...xs);x++) {
            let inside=false;
            for(let i=0,j=points.length-1;i<points.length;j=i++) {
              const [xi,yi]=points[i], [xj,yj]=points[j];
              if((yi>y+.5)!==(yj>y+.5) && x+.5<(xj-xi)*(y+.5-yi)/(yj-yi)+xi) inside=!inside;
            }
            if(inside) r(x,y,1,1,color);
          }
        }
      };
      const sprite = (rows,x,y,palette,scale=1) => rows.forEach((row,dy)=>[...row].forEach((c,dx)=>{ if(palette[c]) r(x+dx*scale,y+dy*scale,scale,scale,palette[c]); }));
      const stops = [[0,[92,188,255]],[.45,[155,220,255]],[.78,[201,236,255]],[1,[255,225,240]]];
      for(let y=0;y<64;y++) {
        const t=y/63;
        let k=0; while(k<stops.length-2 && t>stops[k+1][0]) k++;
        const a=stops[k], b=stops[k+1], u=(t-a[0])/(b[0]-a[0]);
        r(0,y,64,1,`rgb(${a[1].map((v,i)=>Math.round(v+(b[1][i]-v)*u)).join(',')})`);
      }
      for(let y=3;y<64;y+=10) for(let x=3;x<64;x+=10) {
        r(x,y,2,2,'rgba(255,255,255,.68)');
        r(x+5,y+5,2,2,'rgba(255,140,196,.55)');
      }
      // The whole composition is drawn on an integer 64 × 64 pixel grid.
      r(10,16,48,40,'#7192bf45'); r(11,17,48,40,'#7192bf26');
      r(8,12,47,42,'#163e99'); r(7,14,49,38,'#163e99');
      r(8,14,47,39,'#467ae4'); r(9,13,45,40,'#4d85f1');
      r(10,14,43,1,'#91baff'); r(8,15,1,36,'#85b1ff');
      r(9,15,45,7,'#0a5fea'); r(10,15,43,1,'#3c95ff');
      r(10,16,43,1,'#287cff'); r(10,20,43,2,'#164bcd');
      r(9,23,45,29,'#faf6e8'); r(10,23,43,1,'#fffdf6');
      r(10,50,43,1,'#d4d0bc'); r(10,51,43,1,'#fffdf6');
      let tx=12;
      for(const char of 'iooi') { sprite(glyphs[char],tx,16,{'1':'#fffdf8'}); tx+=4; }
      // Three little Luna buttons, rendered as pixels rather than text.
      [36,42].forEach(x=>{ r(x,15,5,6,'#bdd8ff'); r(x+1,16,3,4,'#3678ec'); });
      r(37,19,3,1,'#ffffff');
      r(43,17,3,3,'#ffffff'); r(44,18,1,1,'#3678ec');
      r(48,15,5,6,'#ffdbce'); r(49,16,3,4,'#e87864');
      sprite(['101','010','101'],49,17,{'1':'#fffaf0'});
      if(variant==='love') {
        // A closed rectangular envelope, with the heart sealing its flap.
        ctx.save();
        ctx.translate(0,-2);
        r(18,30,29,19,'#cfbbb94d');
        r(17,29,29,19,'#b67b96'); r(18,30,27,17,'#fff6eb');
        poly([[18,31],[31,39],[18,46]],'#f9dce1');
        poly([[45,31],[31,39],[45,46]],'#f4d2dc');
        poly([[18,47],[31,38],[45,47]],'#c995a5');
        poly([[19,47],[31,39],[44,47]],'#ffe8e8');
        poly([[18,30],[45,30],[31,41]],'#c995a5');
        poly([[19,30],[44,30],[31,39]],'#fffaf1');
        r(19,30,25,1,'#fffef8'); r(19,47,25,1,'#fff4ed');
        const heart=['.PP.PP.','PPPPPPP','PPPPPPP','.PPPPP.','..PPP..','...P...'];
        sprite(heart,28,36,{P:'#c77895'});
        sprite(heart,28,35,{P:'#ed789d'});
        r(29,35,1,1,'#ffc4d8'); r(32,35,1,1,'#ffc4d8');
        ctx.restore();
        if(options.love.flower) {
          r(49,46,2,9,'#769b75'); r(47,49,2,2,'#8aad85'); r(51,47,2,2,'#8aad85');
          sprite(['...PP...','..PHHP..','.PHHHHP.','PHHYYHHP','PHHYYHHP','.PHHHHP.','..PHHP..','...PP...'],46,40,{P:'#de93b6',H:'#f8c6dc',Y:'#f5d97b'});
          r(49,43,1,1,'#fff0ad');
        }
      }

    }
