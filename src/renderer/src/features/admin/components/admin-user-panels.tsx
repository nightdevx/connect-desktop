import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Spin, Tag, message } from "antd";
import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import type { AdminUserDetail } from "@shared/auth-contracts";
import type {
  AdminRelatedUser,
  AdminSessionSummary,
  AdminUserRelations,
} from "@shared/desktop-api-types";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";

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
      setSessions(data.sessions);
    } catch (error) {
      message.error(toErrorMessage(error, "Oturumlar yüklenemedi"));
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
        <h4>Açık Oturumlar</h4>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
      </header>

      {loading && sessions.length === 0 ? (
        <Spin size="small" />
      ) : sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Açık oturum yok" />
      ) : (
        <ul className="ct-admin-plain-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <span className="ct-admin-plain-list-main">
                {session.current ? <Tag color="green">Aktif</Tag> : <Tag>Kullanılmış</Tag>}
                <code>{session.id}</code>
              </span>
              <span className="ct-muted">
                {session.expiresAt ? new Date(session.expiresAt).toLocaleString("tr-TR") : "—"}
              </span>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={async () => {
                  try {
                    await adminService.unwrap(
                      adminService.ops.revokeSession({ userId: user.id, sessionId: session.id }),
                      "Oturum kapatılamadı",
                    );
                    message.success("Oturum kapatıldı");
                    void load();
                  } catch (error) {
                    message.error(toErrorMessage(error, "Oturum kapatılamadı"));
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
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void action(peer)} />
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
      message.error(toErrorMessage(error, "İlişkiler yüklenemedi"));
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
      message.success("Arkadaşlık kaldırıldı");
      void load();
    } catch (error) {
      message.error(toErrorMessage(error, "Arkadaşlık kaldırılamadı"));
    }
  };

  const unblock = async (peer: AdminRelatedUser): Promise<void> => {
    try {
      await adminService.unwrap(
        adminService.ops.setBlock({ userId: user.id, peerId: peer.id, blocked: false }),
        "Engel kaldırılamadı",
      );
      message.success("Engel kaldırıldı");
      void load();
    } catch (error) {
      message.error(toErrorMessage(error, "Engel kaldırılamadı"));
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
        <h4>İlişkiler</h4>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
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
