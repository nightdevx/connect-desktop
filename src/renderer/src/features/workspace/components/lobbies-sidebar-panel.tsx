import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  Camera,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  VolumeX,
} from "lucide-react";
import type { LobbyDescriptor } from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "../../../../../shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { ConfirmActionModal } from "./confirm-action-modal";
import { getApiErrorMessage, getDisplayInitials } from "../workspace-utils";

interface LobbiesSidebarPanelProps {
  lobbiesQuery: UseQueryResult<
    DesktopResult<{ lobbies: LobbyDescriptor[] }>,
    Error
  >;
  lobbies: LobbyDescriptor[];
  lobbyMembersById: Record<string, LobbyStateMember[]>;
  avatarByUserId: Record<string, string | null | undefined>;
  activeLobbyId: string | null;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
  onRenameLobby: (lobbyId: string, nextName: string) => Promise<boolean>;
  onDeleteLobby: (lobbyId: string) => Promise<boolean>;
  renamingLobbyId: string | null;
  deletingLobbyId: string | null;
}

export function LobbiesSidebarPanel({
  lobbiesQuery,
  lobbies,
  lobbyMembersById,
  avatarByUserId,
  activeLobbyId,
  joiningLobbyId,
  onJoinLobby,
  onRenameLobby,
  onDeleteLobby,
  renamingLobbyId,
  deletingLobbyId,
}: LobbiesSidebarPanelProps) {
  const [contextMenu, setContextMenu] = useState<{
    lobby: LobbyDescriptor;
    x: number;
    y: number;
  } | null>(null);
  const [editingLobby, setEditingLobby] = useState<LobbyDescriptor | null>(
    null,
  );
  const [editLobbyName, setEditLobbyName] = useState("");
  const [pendingDeleteLobby, setPendingDeleteLobby] =
    useState<LobbyDescriptor | null>(null);

  const isDefaultLobby = (lobby: LobbyDescriptor): boolean => {
    return lobby.id === "main-lobby" || lobby.createdBy === "system";
  };

  const closeContextMenu = (): void => {
    setContextMenu(null);
  };

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleWindowClick = (): void => {
      closeContextMenu();
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("click", handleWindowClick);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const menuStyle = useMemo(() => {
    if (!contextMenu || typeof window === "undefined") {
      return undefined;
    }

    const menuWidth = 170;
    const menuHeight = 92;
    const padding = 8;

    const clampedX = Math.min(
      Math.max(contextMenu.x, padding),
      window.innerWidth - menuWidth - padding,
    );

    const clampedY = Math.min(
      Math.max(contextMenu.y, padding),
      window.innerHeight - menuHeight - padding,
    );

    return {
      left: clampedX,
      top: clampedY,
    };
  }, [contextMenu]);

  const handleLobbyContextMenu = (
    event: MouseEvent<HTMLLIElement>,
    lobby: LobbyDescriptor,
  ): void => {
    if (isDefaultLobby(lobby)) {
      return;
    }

    event.preventDefault();
    setContextMenu({
      lobby,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleRenameStart = (): void => {
    if (!contextMenu) {
      return;
    }

    setEditingLobby(contextMenu.lobby);
    setEditLobbyName(contextMenu.lobby.name);
    closeContextMenu();
  };

  const handleDelete = async (): Promise<void> => {
    if (!contextMenu) {
      return;
    }

    const target = contextMenu.lobby;
    closeContextMenu();
    setPendingDeleteLobby(target);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!pendingDeleteLobby) {
      return;
    }

    const deleted = await onDeleteLobby(pendingDeleteLobby.id);
    if (deleted) {
      setPendingDeleteLobby(null);
    }
  };

  const handleRenameSubmit = async (): Promise<void> => {
    if (!editingLobby) {
      return;
    }

    const updated = await onRenameLobby(editingLobby.id, editLobbyName);
    if (!updated) {
      return;
    }

    setEditingLobby(null);
    setEditLobbyName("");
  };

  return (
    <>
      <ul className="ct-list">
        {lobbiesQuery.isPending && (
          <li className="ct-list-state">Lobiler yükleniyor...</li>
        )}

        {!lobbiesQuery.isPending && lobbiesQuery.isError && (
          <li className="ct-list-state error">
            Lobiler alınamadı: {lobbiesQuery.error.message}
          </li>
        )}

        {!lobbiesQuery.isPending &&
          !lobbiesQuery.isError &&
          !lobbiesQuery.data?.ok && (
            <li className="ct-list-state error">
              Lobiler alınamadı: {getApiErrorMessage(lobbiesQuery.data?.error)}
            </li>
          )}

        {!lobbiesQuery.isPending &&
          !lobbiesQuery.isError &&
          lobbiesQuery.data?.ok &&
          lobbies.length === 0 && (
            <li className="ct-list-state">Aktif lobi bulunamadı.</li>
          )}

        {lobbies.map((lobby) => {
          const isEditing = renamingLobbyId === lobby.id;
          const isDeleting = deletingLobbyId === lobby.id;
          const members = lobbyMembersById[lobby.id] ?? [];
          const isActive = activeLobbyId === lobby.id;
          const isDisabled = isEditing || isDeleting || joiningLobbyId !== null;

          const handleLobbyClick = (): void => {
            if (isDisabled || isActive) {
              return;
            }

            onJoinLobby(lobby.id);
          };

          return (
            <li
              key={lobby.id}
              className={`ct-list-item clickable ${isActive ? "active" : ""}`}
              onClick={handleLobbyClick}
              onContextMenu={(event) => handleLobbyContextMenu(event, lobby)}
            >
              <div className="ct-lobby-list-content">
                <p>{lobby.name}</p>

                {members.length === 0 ? (
                  <span>Lobide kimse yok.</span>
                ) : (
                  <ul
                    className="ct-lobby-member-list"
                    aria-label="Lobi üyeleri"
                  >
                    {members.map((member) => {
                      const micOpen = !member.muted;
                      const headphoneOpen = !member.deafened;

                      return (
                        <li
                          key={member.userId}
                          className="ct-lobby-member-item"
                        >
                          <div className="ct-lobby-member-main">
                            <div
                              className="ct-user-avatar sm"
                              aria-hidden="true"
                            >
                              {avatarByUserId[member.userId] ? (
                                <img
                                  className="ct-user-avatar-image"
                                  src={
                                    avatarByUserId[member.userId] ?? undefined
                                  }
                                  alt=""
                                />
                              ) : (
                                <span className="ct-user-avatar-fallback">
                                  {getDisplayInitials(member.username)}
                                </span>
                              )}
                            </div>

                            <p className="ct-lobby-member-name">
                              {member.username}
                            </p>
                          </div>

                          <div className="ct-lobby-member-icons">
                            <div
                              className={`ct-lobby-member-icon ${micOpen ? "active" : "inactive"}`}
                              title={`Mikrofon ${micOpen ? "açık" : "kapalı"}`}
                            >
                              {micOpen ? (
                                <Mic size={11} aria-hidden="true" />
                              ) : (
                                <MicOff size={11} aria-hidden="true" />
                              )}
                            </div>

                            <div
                              className={`ct-lobby-member-icon ${headphoneOpen ? "active" : "inactive"}`}
                              title={`Kulaklık ${headphoneOpen ? "açık" : "kapalı"}`}
                            >
                              {headphoneOpen ? (
                                <Headphones size={11} aria-hidden="true" />
                              ) : (
                                <VolumeX size={11} aria-hidden="true" />
                              )}
                            </div>

                            {member.cameraEnabled && (
                              <div
                                className="ct-lobby-member-icon signal"
                                title="Kamera açık"
                              >
                                <Camera size={11} aria-hidden="true" />
                              </div>
                            )}

                            {member.screenSharing && (
                              <div
                                className="ct-lobby-member-icon signal"
                                title="Ekran paylaşımı açık"
                              >
                                <MonitorUp size={11} aria-hidden="true" />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {contextMenu && (
        <div
          className="ct-lobby-context-menu"
          style={menuStyle}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" onClick={handleRenameStart}>
            Düzenle
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => void handleDelete()}
          >
            Sil
          </button>
        </div>
      )}

      {editingLobby && (
        <div
          className="ct-user-popup-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Lobi adını düzenle"
          onClick={() => setEditingLobby(null)}
        >
          <form
            className="ct-user-popup"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameSubmit();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ct-user-popup-header">
              <h4>Lobi Düzenle</h4>
            </div>

            <label className="ct-label" htmlFor="edit-lobby-name">
              Yeni lobi adı
            </label>
            <input
              id="edit-lobby-name"
              type="text"
              className="ct-input"
              value={editLobbyName}
              onChange={(event) => setEditLobbyName(event.target.value)}
              minLength={2}
              maxLength={64}
              disabled={renamingLobbyId === editingLobby.id}
              autoFocus
            />

            <div className="ct-action-row">
              <button
                type="submit"
                className="ct-btn-primary"
                disabled={
                  renamingLobbyId === editingLobby.id ||
                  editLobbyName.trim().length < 2
                }
              >
                {renamingLobbyId === editingLobby.id
                  ? "Kaydediliyor..."
                  : "Kaydet"}
              </button>
              <button
                type="button"
                className="ct-btn-secondary"
                onClick={() => setEditingLobby(null)}
                disabled={renamingLobbyId === editingLobby.id}
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmActionModal
        isOpen={pendingDeleteLobby !== null}
        title="Lobiyi Sil"
        message={
          pendingDeleteLobby
            ? `"${pendingDeleteLobby.name}" lobisini kalıcı olarak silmek istediğine emin misin?`
            : ""
        }
        confirmLabel="Lobiyi Sil"
        isProcessing={
          pendingDeleteLobby !== null &&
          deletingLobbyId === pendingDeleteLobby.id
        }
        onCancel={() => setPendingDeleteLobby(null)}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />
    </>
  );
}
