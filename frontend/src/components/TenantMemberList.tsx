import React from "react";
import { List } from "antd";

interface Member {
    email: string;
    role: string;
    joinedAt: string;
}

interface TenantMemberListProps {
    members: Member[];
}

export default function TenantMemberList({ members }: TenantMemberListProps) {
    return (
        <List
            dataSource={members}
            renderItem={mem => (
                <List.Item>
                    {mem.email} – {mem.role} (joined {new Date(mem.joinedAt).toLocaleDateString()})
                </List.Item>
            )}
        />
    );
}
