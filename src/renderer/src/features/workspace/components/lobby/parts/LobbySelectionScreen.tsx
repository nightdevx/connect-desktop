import type { CSSProperties } from "react";
import { Avatar, Button, Tooltip } from "antd";
import {
  KeyOutlined,
  LoadingOutlined,
  LockOutlined,
  SoundOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { LobbyDescriptor, LobbyStateMember } from "@shared/auth-contracts";
import { AuthLogoMark } from "@/features/auth";
import { PageHeader } from "@/ui/page-header";
import { getDisplayInitials, getUsernameHue } from "../../../workspace-utils";

interface LobbySelectionScreenProps {
  activeLobbyId: string | null;
  lobbiesCount: number;
  lobbies: LobbyDescriptor[];
  /** Live rosters of every room (the WS snapshot), keyed by lobby id. */
  lobbyMembersById: Record<string, LobbyStateMember[]>;
  avatarByUserId: Record<string, string | null | undefined>;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
}

/** Faces shown on a card before the rest collapse into "+N". */
const MAX_FACES = 5;

/**
 * What the lobbies section shows before a room is open.
 *
 * A page title, two live counts, and a grid of rooms that answers "where is
 * everybody?" before the user has to click anything: a room with people in it
 * is drawn lit, with their faces on it, how full it is, and whether somebody
 * in there is sharing a screen. Empty rooms stay quiet so the eye goes to the
 * ones that are alive. The hero survives only for the case it was written for:
 * no rooms at all.
 */
export function LobbySelectionScreen({
  activeLobbyId,
  lobbiesCount,
  lobbies,
  lobbyMembersById,
  avatarByUserId,
  joiningLobbyId,
  onJoinLobby,
}: LobbySelectionScreenProps) {
  // Split rather than filtered in place: the two are different objects to the
  // user — one is a room you join, the other a channel you open — and mixing
  // them in one grid was the whole of "the text rooms look like lobbies".
  const voiceLobbies = lobbies.filter((lobby) => !lobby.isTextOnly);
  const textRooms = lobbies.filter((lobby) => lobby.isTextOnly);

  // The live roster when the stream has one, the descriptor's count when it
  // has not caught up yet — the sidebar makes the same choice.
  const membersOf = (lobby: LobbyDescriptor): LobbyStateMember[] =>
    lobbyMembersById[lobby.id] ?? [];
  const countOf = (lobby: LobbyDescriptor): number =>
    lobbyMembersById[lobby.id]?.length ?? lobby.memberCount;

  const activeRooms = voiceLobbies.filter((lobby) => countOf(lobby) > 0).length;
  const peopleInRooms = voiceLobbies.reduce((sum, lobby) => sum + countOf(lobby), 0);

  return (
    <article
      className={`ct-lobby-main-layer selection ct-lobby-selection ${activeLobbyId ? "hidden-layer" : ""}`}
    >
      <AuthLogoMark className="ct-brand-mural" />

      <PageHeader
        title="Lobiler"
        description="Bir odaya katılarak sesli, görüntülü veya yazılı olarak sohbet edebilirsin."
        actions={
          lobbiesCount > 0 && (
            <>
              <span className="ct-stat-chip">
                <SoundOutlined /> {activeRooms} oda aktif
              </span>
              <span className="ct-stat-chip">
                <span className="ct-online-dot" aria-hidden="true" />
                {peopleInRooms} kişi odalarda
              </span>
            </>
          )
        }
      />

      {lobbiesCount === 0 ? (
        <div className="ct-lobby-selection-empty">
          <AuthLogoMark className="ct-lobby-selection-empty-mark" />
          <h3>Henüz oda yok</h3>
          <p>
            Kenar çubuğundaki + düğmesiyle ilk lobiyi oluştur; herkes buradan
            katılabilir.
          </p>
        </div>
      ) : (
        <>
          <section className="ct-lobby-selection-rooms">
            <h3>
              Sesli Odalar
              <span className="ct-lobby-selection-count">{voiceLobbies.length}</span>
            </h3>

            {voiceLobbies.length === 0 && (
              <p className="ct-lobby-selection-none">Açık sesli oda yok.</p>
            )}

            <ul className="ct-lobby-selection-grid">
              {voiceLobbies.map((lobby) => {
                const isJoining = joiningLobbyId === lobby.id;
                const members = membersOf(lobby);
                const count = countOf(lobby);
                const isLive = count > 0;
                const capacity = lobby.capacity ?? 0;
                const isFull = capacity > 0 && count >= capacity;
                const sharing = members.filter((member) => member.screenSharing);
                const cameras = members.filter((member) => member.cameraEnabled);
                const faces = members.slice(0, MAX_FACES);
                // The descriptor can be ahead of the roster for a beat; the
                // overflow counts people, not drawn faces.
                const overflow = count - faces.length;

                return (
                  <li
                    key={lobby.id}
                    className={`ct-lobby-select-card ${isLive ? "live" : ""}`}
                  >
                    <div className="ct-lobby-select-card-head">
                      <span className="ct-lobby-select-card-icon">
                        <SoundOutlined />
                      </span>

                      <strong title={lobby.name}>{lobby.name}</strong>

                      {sharing.length > 0 && (
                        <Tooltip
                          title={`Yayında: ${sharing.map((member) => member.username).join(", ")}`}
                        >
                          <span className="ct-live-chip">
                            <span className="ct-live-dot" aria-hidden="true" />
                            CANLI
                          </span>
                        </Tooltip>
                      )}

                      {cameras.length > 0 && (
                        <Tooltip
                          title={`Kamerası açık: ${cameras.map((member) => member.username).join(", ")}`}
                        >
                          <VideoCameraOutlined className="ct-lobby-select-card-flag camera" />
                        </Tooltip>
                      )}

                      {lobby.isLocked && (
                        <Tooltip title="Bu lobi kilitlidir">
                          <LockOutlined className="ct-lobby-select-card-flag warn" />
                        </Tooltip>
                      )}

                      {/* A password was invisible everywhere until now: a
                          protected room drew exactly like an open one and you
                          only learned about it from the prompt after clicking. */}
                      {lobby.hasPassword && (
                        <Tooltip title="Şifre korumalı oda">
                          <KeyOutlined className="ct-lobby-select-card-flag warn" />
                        </Tooltip>
                      )}
                    </div>

                    <div className="ct-lobby-select-card-people">
                      {isLive ? (
                        <>
                          {faces.length > 0 && (
                            <span className="ct-lobby-select-faces">
                              {faces.map((member) => (
                                <Tooltip key={member.userId} title={member.username}>
                                  <Avatar
                                    size={26}
                                    src={avatarByUserId[member.userId] ?? undefined}
                                    className="ct-lobby-select-face"
                                    // The same per-person hue the room's name
                                    // colours use, so a face without a picture
                                    // is still told apart from its neighbour.
                                    style={
                                      { "--ct-name-h": getUsernameHue(member.userId) } as CSSProperties
                                    }
                                  >
                                    {getDisplayInitials(member.username)}
                                  </Avatar>
                                </Tooltip>
                              ))}
                              {overflow > 0 && (
                                <span className="ct-lobby-select-face more">+{overflow}</span>
                              )}
                            </span>
                          )}
                          <span className="ct-lobby-select-card-meta">
                            {capacity > 0 ? `${count} / ${capacity} kişi` : `${count} kişi`}
                          </span>
                        </>
                      ) : (
                        <span className="ct-lobby-select-card-meta">
                          Boş oda — ilk gelen sen ol
                        </span>
                      )}
                    </div>

                    {capacity > 0 && (
                      <span
                        className={`ct-lobby-select-meter ${isFull ? "full" : ""}`}
                        aria-hidden="true"
                      >
                        <span style={{ width: `${Math.min(100, (count / capacity) * 100)}%` }} />
                      </span>
                    )}

                    {/* A full room keeps its button: the server is the one that
                        knows who may still get in (an owner, a moderator), and
                        it answers a refused join with its own message. */}
                    <Button
                      className="ct-lobby-select-card-action"
                      onClick={() => onJoinLobby(lobby.id)}
                      disabled={joiningLobbyId !== null}
                      icon={isJoining ? <LoadingOutlined /> : undefined}
                    >
                      {isJoining ? "Katılıyor…" : isFull ? "Oda dolu" : "Katıl"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Text rooms are not lobbies with the sound turned off.

              Nobody is ever "in" one, there is nothing to join and no occupancy
              to report, so drawing them as room cards promised a connection the
              click does not make and left a "0 kişi" that could never be
              anything else. They read as what they are: a list of channels. */}
          {textRooms.length > 0 && (
            <section className="ct-lobby-selection-rooms">
              <h3>
                Yazılı Sohbetler
                <span className="ct-lobby-selection-count">{textRooms.length}</span>
              </h3>

              <ul className="ct-lobby-channel-list">
                {textRooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      className="ct-lobby-channel"
                      onClick={() => onJoinLobby(room.id)}
                    >
                      <span className="ct-lobby-channel-hash" aria-hidden="true">
                        #
                      </span>
                      <span className="ct-lobby-channel-name" title={room.name}>
                        {room.name}
                      </span>

                      {room.isLocked && (
                        <Tooltip title="Yalnızca izin verilenler görebilir">
                          <LockOutlined className="ct-lobby-channel-flag" />
                        </Tooltip>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}
