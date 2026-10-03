import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Spin } from "antd";
import { DeleteOutlined, KeyOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";
import type { AdminUserDetail } from "@shared/auth-contracts";
import type {
  AdminRelatedUser,
  AdminSessionSummary,
  AdminUserRelations,
} from "@shared/desktop-api-types";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";
import { adminDateTime } from "./admin-primitives";
import { toast } from "@/services/toast";

export function AdminUserSessions({ user }: { user: AdminUserDetail }) {
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.userSessions({ userId: user.id }),
        "Oturumlar yüklenemedi",
      );
      // A server older than the fix also lists the spent links of each
      // rotation chain -- one row per refresh. Only the live token is a session.
      setSessions(data.sessions.filter((session) => session.current));
    } catch (error) {
      toast.error(toErrorMessage(error, "Oturumlar yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="ct-admin-drawer-block">
      <header>
        <h4>
          <KeyOutlined /> Açık oturumlar
        </h4>
        <Button
          size="small"
          type="text"
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          loading={loading}
          aria-label="Yenile"
        />
      </header>

      {loading && sessions.length === 0 ? (
        <Spin size="small" />
      ) : sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Açık oturum yok" />
      ) : (
        <ul className="ct-admin-plain-list">
          {sessions.map((session) => (
            // One row per signed-in device. Its token rotates on every refresh,
            // so the id (a digest of that token) changes with it and is not
            // shown, and the time is the device's last refresh, not its sign-in.
            <li key={session.id}>
              <span className="ct-admin-plain-list-main">
                Son yenileme {adminDateTime(session.createdAt)}
              </span>
              <span className="ct-muted">Bitiş {adminDateTime(session.expiresAt)}</span>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="Oturumu kapat"
                onClick={async () => {
                  try {
                    await adminService.unwrap(
                      adminService.ops.revokeSession({ userId: user.id, sessionId: session.id }),
                      "Oturum kapatılamadı",
                    );
                    toast.success("Oturum kapatıldı");
                    void load();
                  } catch (error) {
                    toast.error(toErrorMessage(error, "Oturum kapatılamadı"));
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RelationGroup = ({
  title,
  people,
  action,
}: {
  title: string;
  people: AdminRelatedUser[];
  action?: (peer: AdminRelatedUser) => Promise<void>;
}) => {
  if (people.length === 0) {
    return null;
  }

  return (
    <div className="ct-admin-relation-group">
      <span className="ct-admin-relation-title">
        {title} ({people.length})
      </span>
      <ul className="ct-admin-plain-list">
        {people.map((peer) => (
          <li key={peer.id}>
            <span className="ct-admin-plain-list-main">@{peer.username}</span>
            <span className="ct-muted">{peer.displayName}</span>
            {action && (
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="Kaldır"
                onClick={() => void action(peer)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export function AdminUserRelationsPanel({ user }: { user: AdminUserDetail }) {
  const [relations, setRelations] = useState<AdminUserRelations | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.userRelations({ userId: user.id }),
        "İlişkiler yüklenemedi",
      );
      setRelations(data.relations);
    } catch (error) {
      toast.error(toErrorMessage(error, "İlişkiler yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeFriend = async (peer: AdminRelatedUser): Promise<void> => {
    try {
      await adminService.unwrap(
        adminService.ops.removeFriend({ userId: user.id, peerId: peer.id }),
        "Arkadaşlık kaldırılamadı",
      );
      toast.success("Arkadaşlık kaldırıldı");
      void load();
    } catch (error) {
      toast.error(toErrorMessage(error, "Arkadaşlık kaldırılamadı"));
    }
  };

  const unblock = async (peer: AdminRelatedUser): Promise<void> => {
    try {
      await adminService.unwrap(
        adminService.ops.setBlock({ userId: user.id, peerId: peer.id, blocked: false }),
        "Engel kaldırılamadı",
      );
      toast.success("Engel kaldırıldı");
      void load();
    } catch (error) {
      toast.error(toErrorMessage(error, "Engel kaldırılamadı"));
    }
  };

  const empty =
    relations &&
    relations.friends.length === 0 &&
    relations.incomingPending.length === 0 &&
    relations.outgoingPending.length === 0 &&
    relations.blocked.length === 0 &&
    relations.blockedBy.length === 0;

  return (
    <section className="ct-admin-drawer-block">
      <header>
        <h4>
          <TeamOutlined /> İlişkiler
        </h4>
        <Button
          size="small"
          type="text"
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          loading={loading}
          aria-label="Yenile"
        />
      </header>

      {loading && !relations ? (
        <Spin size="small" />
      ) : empty ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bağlantı yok" />
      ) : (
        relations && (
          <>
            <RelationGroup title="Arkadaşlar" people={relations.friends} action={removeFriend} />
            <RelationGroup title="Gelen istekler" people={relations.incomingPending} action={removeFriend} />
            <RelationGroup title="Giden istekler" people={relations.outgoingPending} action={removeFriend} />
            <RelationGroup title="Engellediği" people={relations.blocked} action={unblock} />
            <RelationGroup title="Onu engelleyen" people={relations.blockedBy} />
          </>
        )
      )}
    </section>
  );
}
