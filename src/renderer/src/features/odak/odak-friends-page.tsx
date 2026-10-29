import type { ReactNode } from "react";
import type { WorkspaceSection } from "@/store/ui-store";

/**
 * The Arkadaşlar page in the "Odak" design, drawn exactly as the mock-up and
 * filled with its sample data. Nothing here is wired to the app yet except the
 * section rail, so the page can be left again; friends, conversations, calls
 * and requests are placeholders until the design is settled.
 */

const Icon = ({ children, size = 19 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const SpeakerIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </Icon>
);

const UsersIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

const GamepadIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="6" x2="10" y1="12" y2="12" />
    <line x1="8" x2="8" y1="10" y2="14" />
    <line x1="15" x2="15.01" y1="13" y2="13" />
    <line x1="18" x2="18.01" y1="11" y2="11" />
    <rect width="20" height="12" x="2" y="6" rx="2" />
  </Icon>
);

const GiftIcon = () => (
  <Icon>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5 12 8c1-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </Icon>
);

const SlidersIcon = () => (
  <Icon>
    <line x1="4" x2="4" y1="21" y2="14" />
    <line x1="4" x2="4" y1="10" y2="3" />
    <line x1="12" x2="12" y1="21" y2="12" />
    <line x1="12" x2="12" y1="8" y2="3" />
    <line x1="20" x2="20" y1="21" y2="16" />
    <line x1="20" x2="20" y1="12" y2="3" />
    <line x1="2" x2="6" y1="14" y2="14" />
    <line x1="10" x2="14" y1="8" y2="8" />
    <line x1="18" x2="22" y1="16" y2="16" />
  </Icon>
);

const ShieldIcon = () => (
  <Icon>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Icon>
);

const SearchIcon = () => (
  <Icon size={15}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

const PlusIcon = () => (
  <Icon size={15}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Icon>
);

const MessageIcon = () => (
  <Icon size={16}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);

const PhoneIcon = () => (
  <Icon size={16}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Icon>
);

const CheckIcon = () => (
  <Icon size={16}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

const CloseIcon = () => (
  <Icon size={15}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);

type Presence = "online" | "idle" | "busy";

interface SampleFriend {
  name: string;
  initial: string;
  color: string;
  presence: Presence;
  status: string;
  unread: number;
}

const SAMPLE_FRIENDS: SampleFriend[] = [
  { name: "Ayşe", initial: "A", color: "#EA580C", presence: "online", status: "Oyun Odası’nda · konuşuyor", unread: 2 },
  { name: "Can", initial: "C", color: "#0891B2", presence: "online", status: "Valorant oynuyor · 48 dk", unread: 0 },
  { name: "Selin", initial: "S", color: "#D97706", presence: "online", status: "Ana Lobi’de", unread: 0 },
  { name: "Deniz", initial: "D", color: "#9333EA", presence: "online", status: "Oyun Odası’nda · mikrofon kapalı", unread: 0 },
  { name: "Kaan", initial: "K", color: "#7C3AED", presence: "busy", status: "Rahatsız etmeyin", unread: 1 },
  { name: "Elif", initial: "E", color: "#0D9488", presence: "idle", status: "Boşta · 12 dk", unread: 0 },
];

const SECTIONS: Array<{ id: WorkspaceSection; label: string; icon: ReactNode }> = [
  { id: "lobbies", label: "Lobiler", icon: <SpeakerIcon /> },
  { id: "users", label: "Arkadaşlar", icon: <UsersIcon /> },
  { id: "minigames", label: "Oyunlar", icon: <GamepadIcon /> },
  { id: "free-games", label: "Fırsatlar", icon: <GiftIcon /> },
  { id: "settings", label: "Ayarlar", icon: <SlidersIcon /> },
  { id: "admin", label: "Yönetim", icon: <ShieldIcon /> },
];

interface OdakFriendsPageProps {
  onSectionChange: (section: WorkspaceSection) => void;
}

export function OdakFriendsPage({ onSectionChange }: OdakFriendsPageProps) {
  return (
    <div className="ct-odak">
      <nav className="ct-odak-rail" aria-label="Bölümler">
        <span className="ct-odak-logo" aria-hidden="true">C</span>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`ct-odak-rail-item ${section.id === "users" ? "active" : ""}`}
            aria-current={section.id === "users" ? "page" : undefined}
            onClick={() => onSectionChange(section.id)}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
        <div className="ct-odak-fill" />
        <button type="button" className="ct-odak-me" aria-label="Profilin, çevrimiçi">
          E<span className="ct-odak-presence online" aria-hidden="true" />
        </button>
      </nav>

      <nav className="ct-odak-strip" aria-label="Sohbetler">
        <button type="button" className="ct-odak-strip-home" aria-label="Arkadaşlar ana sayfası" aria-current="page">
          <UsersIcon size={20} />
        </button>
        <div className="ct-odak-strip-divider" />
        {SAMPLE_FRIENDS.slice(0, 4).map((friend) => (
          <button
            key={friend.name}
            type="button"
            className="ct-odak-strip-dm"
            style={{ background: friend.color }}
            title={friend.name}
            aria-label={`${friend.name} ile sohbet${friend.unread ? `, ${friend.unread} okunmamış` : ""}`}
          >
            {friend.initial}
            <span className={`ct-odak-presence ${friend.presence}`} aria-hidden="true" />
            {friend.unread > 0 && (
              <span className="ct-odak-count" aria-hidden="true">{friend.unread}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="ct-odak-main">
        <header className="ct-odak-header">
          <div className="ct-odak-pill">
            <h1>Arkadaşlar</h1>
          </div>
          <div className="ct-odak-tabs" role="tablist" aria-label="Arkadaş listesi">
            <button type="button" role="tab" aria-selected="true" className="active">Çevrimiçi · 6</button>
            <button type="button" role="tab" aria-selected="false">Tümü · 12</button>
            <button type="button" role="tab" aria-selected="false">İstekler · 2</button>
          </div>
          <div className="ct-odak-fill" />
          <label className="ct-odak-search">
            <SearchIcon />
            <span className="ct-odak-sr">Arkadaş ara</span>
            <input placeholder="Arkadaş ara" />
          </label>
          <button type="button" className="ct-odak-primary">
            <PlusIcon />
            Arkadaş ekle
          </button>
        </header>

        <div className="ct-odak-body">
          <section className="ct-odak-friends" aria-label="Çevrimiçi arkadaşlar">
            {SAMPLE_FRIENDS.map((friend) => (
              <article key={friend.name} className="ct-odak-card ct-odak-friend">
                <span className="ct-odak-avatar" style={{ background: friend.color }} aria-hidden="true">
                  {friend.initial}
                  <span className={`ct-odak-presence ${friend.presence}`} />
                </span>
                <div className="ct-odak-friend-meta">
                  <div className="ct-odak-friend-name">{friend.name}</div>
                  <div className="ct-odak-friend-status">{friend.status}</div>
                </div>
                <button type="button" className="ct-odak-icon-button" aria-label={`${friend.name} ile mesajlaş`}>
                  <MessageIcon />
                </button>
                <button type="button" className="ct-odak-icon-button" aria-label={`${friend.name} kişisini ara`}>
                  <PhoneIcon />
                </button>
              </article>
            ))}
          </section>

          <aside className="ct-odak-side" aria-label="Şu an aktif">
            <h2 className="ct-odak-side-title">ŞU AN AKTİF</h2>

            <article className="ct-odak-card ct-odak-activity ct-odak-activity-room">
              <div className="ct-odak-activity-row">
                <span className="ct-odak-tile accent" aria-hidden="true"><SpeakerIcon size={17} /></span>
                <div className="ct-odak-fill">
                  <div className="ct-odak-activity-name">Oyun Odası</div>
                  <div className="ct-odak-muted">Ayşe, Can ve Deniz burada</div>
                </div>
                <span className="ct-odak-live-dot" aria-hidden="true" />
              </div>
              <div className="ct-odak-activity-row">
                <div className="ct-odak-faces" aria-hidden="true">
                  <span style={{ background: "#EA580C" }}>A</span>
                  <span style={{ background: "#0891B2" }}>C</span>
                  <span style={{ background: "#9333EA" }}>D</span>
                </div>
                <span className="ct-odak-fill ct-odak-muted">Can ekran paylaşıyor</span>
                <button type="button" className="ct-odak-primary small">Katıl</button>
              </div>
            </article>

            <article className="ct-odak-card ct-odak-activity ct-odak-activity-row">
              <span className="ct-odak-tile game" aria-hidden="true"><GamepadIcon size={20} /></span>
              <div className="ct-odak-fill">
                <div className="ct-odak-activity-name">Valorant</div>
                <div className="ct-odak-muted">
                  Can oynuyor · <span className="ct-odak-mono">48 dk</span>
                </div>
              </div>
            </article>

            <article className="ct-odak-card ct-odak-activity ct-odak-activity-row">
              <span className="ct-odak-tile accent" aria-hidden="true"><SpeakerIcon size={19} /></span>
              <div className="ct-odak-fill">
                <div className="ct-odak-activity-name">Ana Lobi</div>
                <div className="ct-odak-muted">Selin ve 3 kişi</div>
              </div>
              <button type="button" className="ct-odak-secondary small">Katıl</button>
            </article>

            <h2 className="ct-odak-side-title spaced">BEKLEYEN İSTEKLER</h2>
            <article className="ct-odak-card ct-odak-activity ct-odak-activity-row">
              <span className="ct-odak-request-avatar" aria-hidden="true">M</span>
              <div className="ct-odak-fill">
                <div className="ct-odak-activity-name">mert_42</div>
                <div className="ct-odak-muted">Seni ekledi</div>
              </div>
              <button type="button" className="ct-odak-accept" aria-label="mert_42 isteğini kabul et">
                <CheckIcon />
              </button>
              <button type="button" className="ct-odak-decline" aria-label="mert_42 isteğini reddet">
                <CloseIcon />
              </button>
            </article>
          </aside>
        </div>
      </main>
    </div>
  );
}
