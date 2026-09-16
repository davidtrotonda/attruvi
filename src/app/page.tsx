import Image from "next/image";

const githubUrl =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/davidtrotonda/attruvi";

const partners = [
  "React Native",
  "Google Ads",
  "Meta Ads",
  "TikTok Ads",
  "Postbacks server-side",
  "Código abierto",
];

const features = [
  {
    index: "01",
    eyebrow: "ATRIBUCIÓN",
    title: "Descubre qué anuncio convirtió.",
    text: "Conecta el clic publicitario con la instalación, la compra y los ingresos que llegan después.",
    visual: <AttributionVisual />,
  },
  {
    index: "02",
    eyebrow: "CALIDAD",
    title: "Mide el valor, no solo la instalación.",
    text: "Compara campañas por retención, compras e ingresos reales durante todo el ciclo del usuario.",
    visual: <RetentionVisual />,
  },
  {
    index: "03",
    eyebrow: "SEÑALES",
    title: "Devuelve mejores datos a cada red.",
    text: "Envía conversiones útiles a Google Ads, Meta Ads y TikTok Ads para ayudar a sus algoritmos a optimizar.",
    visual: <SignalVisual />,
  },
];

const faqs = [
  {
    question: "¿Qué es Attruvi?",
    answer:
      "Attruvi es un proyecto de atribución móvil de código abierto para aplicaciones React Native. Su objetivo es unir anuncios, instalaciones, compras, ingresos y retención en una misma lectura.",
  },
  {
    question: "¿Sustituye a AppsFlyer o Adjust?",
    answer:
      "El objetivo inicial es cubrir el núcleo que más importa a equipos pequeños: atribución, eventos, ingresos, retención y envío de conversiones a las redes publicitarias. No pretende copiar desde el primer día todas las funciones empresariales de esas plataformas.",
  },
  {
    question: "¿Funciona con iOS y Android?",
    answer:
      "Está diseñado para proyectos React Native en ambas plataformas. La implementación respetará las limitaciones de privacidad y atribución propias de iOS y Android.",
  },
  {
    question: "¿Es realmente código abierto?",
    answer:
      "Sí. El proyecto se desarrolla públicamente con licencia MIT para que puedas auditarlo, adaptarlo y alojarlo en tu propia infraestructura.",
  },
  {
    question: "¿Ya está listo para producción?",
    answer:
      "Todavía no. Attruvi está en su primera etapa pública. La web y el repositorio muestran el alcance, la arquitectura y el progreso con transparencia.",
  },
];

export default function Home() {
  return (
    <main>
      <div className="announcement">
        <span className="announcement-dot" />
        <span>Attruvi está naciendo en abierto para React Native</span>
        <a href={githubUrl} target="_blank" rel="noreferrer">
          Seguir el desarrollo <ArrowIcon />
        </a>
      </div>

      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Attruvi, inicio">
          <LogoMark />
          <span>Attruvi</span>
        </a>
        <nav aria-label="Navegación principal">
          <a href="#producto">Producto</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#open-source">Código abierto</a>
          <a href="#preguntas">Preguntas</a>
        </nav>
        <a
          className="header-github"
          href={githubUrl}
          target="_blank"
          rel="noreferrer"
        >
          <GithubIcon />
          GitHub
        </a>
      </header>

      <section className="hero grid-surface" id="inicio">
        <div className="hero-orbit orbit-one" aria-hidden="true">
          <span>install</span>
        </div>
        <div className="hero-orbit orbit-two" aria-hidden="true">
          <span>purchase</span>
        </div>
        <div className="hero-orbit orbit-three" aria-hidden="true">
          <span>revenue</span>
        </div>
        <div className="hero-content">
          <div className="pill reveal reveal-1">
            <span className="status-dot" />
            Atribución móvil de código abierto
          </div>
          <h1 className="reveal reveal-2">
            De cada anuncio al
            <span> valor real.</span>
          </h1>
          <p className="hero-copy reveal reveal-3">
            Attruvi conecta anuncios con instalaciones, compras e ingresos. Y
            envía las conversiones a Google, Meta y TikTok para que tus campañas
            aprendan con mejores señales.
          </p>
          <div className="hero-actions reveal reveal-4">
            <a
              className="button button-primary"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              <GithubIcon /> Ver en GitHub
            </a>
            <a className="button button-secondary" href="#como-funciona">
              Ver cómo funciona <ArrowDownIcon />
            </a>
          </div>
          <div className="availability reveal reveal-5">
            <span>Proyecto en desarrollo</span>
            <i />
            <span>Solo React Native</span>
            <i />
            <span>Licencia MIT</span>
          </div>
        </div>

        <ProductDemo />
      </section>

      <section className="marquee-section" aria-label="Tecnologías previstas">
        <p>DISEÑADO PARA TRABAJAR CON</p>
        <div className="marquee-window">
          <div className="marquee-track">
            {[...partners, ...partners].map((partner, index) => (
              <span key={`${partner}-${index}`}>
                <CheckSpark /> {partner}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section grid-surface" id="producto">
        <SectionMarker number="01 / 04" label="PRODUCTO" />
        <div className="section-heading">
          <p className="kicker">{"// DEL CLIC AL INGRESO //"}</p>
          <h2>
            Atribución que entiende
            <span> todo el recorrido.</span>
          </h2>
          <p>
            No te quedes con una instalación. Sigue al usuario hasta la compra
            y descubre qué campaña genera clientes que vuelven.
          </p>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.index}>
              <div className="feature-meta">
                <span>{feature.index}</span>
                <span>{feature.eyebrow}</span>
              </div>
              <div className="feature-visual">{feature.visual}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="como-funciona">
        <SectionMarker number="02 / 04" label="CÓMO FUNCIONA" dark />
        <div className="dark-heading">
          <p className="kicker">{"// UNA INTEGRACIÓN, TODO EL CICLO //"}</p>
          <h2>Instala el SDK. Attruvi conecta el resto.</h2>
        </div>

        <div className="steps-layout">
          <div className="steps-list">
            <Step
              number="01"
              title="Integra React Native"
              text="Añade el SDK y registra los eventos importantes de tu aplicación."
              active
            />
            <Step
              number="02"
              title="Unimos cada señal"
              text="Relacionamos campaña, instalación, sesiones, compra e ingresos."
            />
            <Step
              number="03"
              title="Enviamos las conversiones"
              text="Los eventos válidos vuelven a Google, Meta y TikTok desde el servidor."
            />
          </div>
          <div className="code-window">
            <div className="code-window-bar">
              <div className="window-dots"><i /><i /><i /></div>
              <span>checkout.tsx</span>
              <span className="live-badge">LIVE</span>
            </div>
            <pre aria-label="Ejemplo de integración de Attruvi">
              <code>
                <span className="code-muted">1</span>{"  "}
                <span className="code-pink">import</span>{" { Attruvi } "}
                <span className="code-pink">from</span>{" "}
                <span className="code-green">&quot;@attruvi/react-native&quot;</span>
                {";\n"}
                <span className="code-muted">2</span>{"\n"}
                <span className="code-muted">3</span>{"  "}
                <span className="code-pink">await</span>{" Attruvi."}
                <span className="code-blue">track</span>{"("}
                <span className="code-green">&quot;purchase&quot;</span>{", {\n"}
                <span className="code-muted">4</span>{"    value: "}
                <span className="code-orange">49.90</span>{",\n"}
                <span className="code-muted">5</span>{"    currency: "}
                <span className="code-green">&quot;EUR&quot;</span>{",\n"}
                <span className="code-muted">6</span>{"    orderId: order.id,\n"}
                <span className="code-muted">7</span>{"  });"}
              </code>
            </pre>
            <div className="code-result">
              <div>
                <span className="result-dot" />
                Evento atribuido
              </div>
              <strong>Meta · campaña verano</strong>
              <span>49,90 €</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section grid-surface" id="open-source">
        <SectionMarker number="03 / 04" label="CÓDIGO ABIERTO" />
        <div className="open-layout">
          <div className="open-copy">
            <p className="kicker">{"// TU MEDICIÓN, TUS DATOS //"}</p>
            <h2>
              Transparente por diseño.
              <span> Tuyo por completo.</span>
            </h2>
            <p>
              Consulta cómo funciona la atribución, despliega tu propia
              infraestructura y adapta cada pieza a tus aplicaciones.
            </p>
            <a
              className="text-link"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              Explorar el repositorio <ArrowIcon />
            </a>
          </div>
          <div className="repo-card">
            <div className="repo-head">
              <div className="repo-title">
                <LogoMark />
                <div>
                  <span>attruvi / attruvi</span>
                  <small>Público · MIT</small>
                </div>
              </div>
              <span className="repo-chip">★ Star</span>
            </div>
            <div className="repo-tree">
              <RepoRow icon="▸" name="apps" detail="dashboard y API" />
              <RepoRow icon="▸" name="packages" detail="SDK React Native" />
              <RepoRow icon="◇" name="LICENSE" detail="MIT" />
              <RepoRow icon="◇" name="README.md" detail="Empieza aquí" />
            </div>
            <div className="commit-flow" aria-hidden="true">
              <i /><i /><i /><i /><i />
              <span>construido en abierto</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section faq-section" id="preguntas">
        <SectionMarker number="04 / 04" label="PREGUNTAS" />
        <div className="faq-layout">
          <div className="faq-heading">
            <p className="kicker">{"// SIN LETRA PEQUEÑA //"}</p>
            <h2>Preguntas frecuentes.</h2>
            <p>Lo que puedes esperar de la primera versión de Attruvi.</p>
          </div>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <details key={faq.question} open={index === 0}>
                <summary>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {faq.question}
                  <i aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta grid-surface">
        <div className="final-mark"><LogoMark /></div>
        <p className="kicker">{"// CONSTRÚYELO CON NOSOTROS //"}</p>
        <h2>
          La atribución móvil puede ser
          <span> abierta.</span>
        </h2>
        <p>
          Sigue el desarrollo de Attruvi y ayúdanos a construir una alternativa
          transparente para React Native.
        </p>
        <a
          className="button button-primary"
          href={githubUrl}
          target="_blank"
          rel="noreferrer"
        >
          <GithubIcon /> Ver el proyecto
        </a>
      </section>

      <footer>
        <a className="brand" href="#inicio">
          <LogoMark />
          <span>Attruvi</span>
        </a>
        <p>Atribución móvil de código abierto para React Native.</p>
        <div>
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href="#preguntas">Preguntas</a>
          <span>© 2026 Attruvi</span>
        </div>
      </footer>
    </main>
  );
}

function ProductDemo() {
  return (
    <div className="product-demo reveal reveal-5" aria-label="Vista previa de Attruvi">
      <div className="demo-topbar">
        <div className="window-dots"><i /><i /><i /></div>
        <span>attruvi.com / overview</span>
        <div className="demo-status"><i /> Recibiendo eventos</div>
      </div>
      <div className="demo-body">
        <aside>
          <div className="demo-mini-brand"><LogoMark /><span>Attruvi</span></div>
          <div className="demo-nav active"><GridIcon />Resumen</div>
          <div className="demo-nav"><BranchIcon />Atribución</div>
          <div className="demo-nav"><PulseIcon />Eventos</div>
          <div className="demo-nav"><SendIcon />Postbacks</div>
        </aside>
        <div className="demo-content">
          <div className="demo-heading-row">
            <div><small>RENDIMIENTO · 30 DÍAS</small><strong>¿Qué anuncios generan valor?</strong></div>
            <span className="demo-filter">Todas las campañas⌄</span>
          </div>
          <div className="metric-row">
            <Metric label="Ingresos atribuidos" value="48.290 €" delta="+18,4%" />
            <Metric label="Compras" value="1.284" delta="+12,1%" />
            <Metric label="ROAS" value="4,82×" delta="+0,61" />
          </div>
          <div className="demo-chart">
            <div className="chart-head"><span>Ingresos por red</span><small>€ 12K</small></div>
            <div className="chart-grid" />
            <svg viewBox="0 0 760 150" role="img" aria-label="Gráfico ascendente de ingresos atribuidos">
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ff5a1f" stopOpacity=".28" />
                  <stop offset="100%" stopColor="#5b5cf0" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="chart-area" d="M0,132 C62,125 74,96 132,102 C190,108 202,68 266,78 C330,88 352,54 414,60 C486,66 510,32 570,41 C632,51 668,11 760,18 L760,150 L0,150 Z" />
              <path className="chart-line" pathLength="1" d="M0,132 C62,125 74,96 132,102 C190,108 202,68 266,78 C330,88 352,54 414,60 C486,66 510,32 570,41 C632,51 668,11 760,18" />
              <circle className="chart-point point-one" cx="266" cy="78" r="4" />
              <circle className="chart-point point-two" cx="570" cy="41" r="4" />
              <circle className="chart-point point-three" cx="760" cy="18" r="4" />
            </svg>
            <div className="chart-labels"><span>Google</span><span>Meta</span><span>TikTok</span><span>Orgánico</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function AttributionVisual() {
  return (
    <div className="attribution-visual">
      <div className="source-node">META<span>Campaña 04</span></div>
      <div className="flow-line"><i /></div>
      <div className="user-node"><span>U</span><small>Usuario 8F2</small></div>
      <div className="flow-line"><i /></div>
      <div className="value-node">+49,90 €<span>Compra atribuida</span></div>
    </div>
  );
}

function RetentionVisual() {
  const bars = [42, 78, 55, 88, 64, 96, 72, 84];
  return (
    <div className="retention-visual">
      <div className="retention-top"><span>Retención D30</span><strong>38,2%</strong></div>
      <div className="retention-bars">
        {bars.map((height, index) => (
          <i key={index} style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />
        ))}
      </div>
      <div className="retention-bottom"><span>D1</span><span>D7</span><span>D14</span><span>D30</span></div>
    </div>
  );
}

function SignalVisual() {
  return (
    <div className="signal-visual">
      <div className="event-pill"><i /> purchase_verified</div>
      <div className="signal-lines"><i /><i /><i /></div>
      <div className="network-row">
        <span>G</span><span>M</span><span>T</span>
      </div>
      <div className="sent-row"><span>Enviado</span><span>Enviado</span><span>Enviado</span></div>
    </div>
  );
}

function Step({ number, title, text, active = false }: { number: string; title: string; text: string; active?: boolean }) {
  return (
    <article className={`step ${active ? "active" : ""}`}>
      <span>{number}</span>
      <div><h3>{title}</h3><p>{text}</p></div>
      <ArrowIcon />
    </article>
  );
}

function SectionMarker({ number, label, dark = false }: { number: string; label: string; dark?: boolean }) {
  return (
    <div className={`section-marker ${dark ? "dark" : ""}`}>
      <span>{number}</span><i /> <strong>{label}</strong>
    </div>
  );
}

function RepoRow({ icon, name, detail }: { icon: string; name: string; detail: string }) {
  return <div><span>{icon}</span><strong>{name}</strong><small>{detail}</small></div>;
}

function LogoMark() {
  return (
    <Image
      className="logo-mark"
      src="/attruvi-logo.png"
      alt=""
      width={64}
      height={64}
      aria-hidden="true"
      priority
    />
  );
}

function GithubIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowDownIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v11m-4-4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckSpark() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 10 4 4 9-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="5" r="2.5" fill="currentColor" opacity=".18" /></svg>;
}

function GridIcon() { return <svg viewBox="0 0 20 20"><path d="M3 3h5v5H3zm9 0h5v5h-5zM3 12h5v5H3zm9 0h5v5h-5z" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>; }
function BranchIcon() { return <svg viewBox="0 0 20 20"><circle cx="5" cy="4" r="2" fill="none" stroke="currentColor"/><circle cx="15" cy="15" r="2" fill="none" stroke="currentColor"/><path d="M5 6v4c0 3 2 5 5 5h3M5 10h5c3 0 5-2 5-5" fill="none" stroke="currentColor"/></svg>; }
function PulseIcon() { return <svg viewBox="0 0 20 20"><path d="M2 10h4l2-5 4 10 2-5h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>; }
function SendIcon() { return <svg viewBox="0 0 20 20"><path d="m3 4 14 6-14 6 2-6-2-6Z" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M5 10h8" stroke="currentColor"/></svg>; }
