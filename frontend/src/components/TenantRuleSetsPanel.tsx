import React, { useState, useMemo } from "react";
import { Table, Button, Tag, Spin, Space, Switch, Card, Select, Input, Badge, Divider, App, Empty, Modal, Form } from "antd";
import { Shield, ShieldAlert, ShieldCheck, Search, Filter, Settings2, Plus, ArrowRight, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CrsRule {
    id: string;
    ruleId?: string;
    name: string;
    category: string;
    severity: string;
    action: string;
    description: string;
}

interface TenantRuleSet {
    id: string;
    name: string;
    description: string;
    ruleIds: string[];
    disabledRuleIds: string[];
    sourceTemplateId?: string;
    createdAt: string;
}

interface Props {
    tenantId: string;
}

export default function TenantRuleSetsPanel({ tenantId }: Props) {
    const { notification } = App.useApp();
    const queryClient = useQueryClient();
    const [activeRuleSetId, setActiveRuleSetId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");

    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. Fetch Global Rules
    const { data: globalRules = [], isLoading: rulesLoading } = useQuery<CrsRule[]>({
        queryKey: ["crs-rules"],
        queryFn: async () => {
            const res = await fetch("/api/platform/crs/rules", { headers });
            if (!res.ok) throw new Error("Failed to fetch global rules");
            return res.json();
        }
    });

    // 2. Fetch Tenant Rule Sets
    const { data: ruleSets = [], isLoading: ruleSetsLoading } = useQuery<TenantRuleSet[]>({
        queryKey: ["tenant-rulesets", tenantId],
        queryFn: async () => {
            const res = await fetch(`/api/admin/tenants/${tenantId}/rulesets`, { headers });
            if (!res.ok) throw new Error("Failed to fetch tenant rule sets");
            return res.json();
        }
    });

    // Auto-select first rule set using effect instead of deprecated onSuccess
    React.useEffect(() => {
        if (ruleSets && ruleSets.length > 0 && !activeRuleSetId) {
            setActiveRuleSetId(ruleSets[0].id);
        }
    }, [ruleSets, activeRuleSetId]);

    const activeRuleSet = useMemo(() =>
        (ruleSets as TenantRuleSet[]).find(rs => rs.id === activeRuleSetId) || null
        , [ruleSets, activeRuleSetId]);

    // 3. Mutation for Rule Overrides
    const overrideMutation = useMutation({
        mutationFn: async ({ ruleId, enabled }: { ruleId: string, enabled: boolean }) => {
            const res = await fetch(`/api/admin/tenants/${tenantId}/rulesets/${activeRuleSetId}/overrides`, {
                method: "POST",
                headers,
                body: JSON.stringify({ ruleId, enabled }),
            });
            if (!res.ok) throw new Error("Failed to update override");
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tenant-rulesets", tenantId] });
            notification.success({ message: "Rule Updated", description: "Override successfully applied." });
        }
    });

    // 4. Delete Rule Set
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/admin/tenants/${tenantId}/rulesets/${id}`, {
                method: "DELETE",
                headers
            });
            if (!res.ok) throw new Error("Failed to delete ruleset");
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tenant-rulesets", tenantId] });
            notification.success({ message: "Rule Set Deleted" });
            if (activeRuleSetId) setActiveRuleSetId(null);
        }
    });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm] = Form.useForm();

    const createMutation = useMutation({
        mutationFn: async (values: any) => {
            const res = await fetch(`/api/admin/tenants/${tenantId}/rulesets`, {
                method: "POST",
                headers,
                body: JSON.stringify({ ...values, ruleIds: [] }), // Initially empty, admin can enable rules later
            });
            if (!res.ok) throw new Error("Failed to create rule set");
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["tenant-rulesets", tenantId] });
            notification.success({ message: "Rule Set Created" });
            setIsCreateModalOpen(false);
            createForm.resetFields();
            setActiveRuleSetId(data.id);
        }
    });

    const handleCreateRuleSet = async () => {
        try {
            const values = await createForm.validateFields();
            createMutation.mutate(values);
        } catch (e) { }
    };

    const filteredRules = useMemo(() => {
        if (!activeRuleSet) return [];
        return globalRules.filter(r => {
            const inSet = activeRuleSet.ruleIds.includes(r.id) || activeRuleSet.ruleIds.includes(r.ruleId || "");
            if (!inSet) return false;

            const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.ruleId || "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = filterCategory === "all" || r.category === filterCategory;

            return matchesSearch && matchesCategory;
        });
    }, [globalRules, activeRuleSet, searchTerm, filterCategory]);

    const categories = ["all", ...new Set(globalRules.map(r => r.category))];

    const columns = [
        {
            title: "Rule ID",
            dataIndex: "ruleId",
            key: "ruleId",
            render: (id: string) => <code className="text-primary font-bold">{id}</code>
        },
        {
            title: "Name",
            dataIndex: "name",
            key: "name",
            render: (name: string, record: any) => (
                <div>
                    <div className="font-semibold text-sm">{name}</div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">{record.description}</div>
                </div>
            )
        },
        {
            title: "Status",
            key: "status",
            render: (_: any, record: CrsRule) => {
                const isOverridden = activeRuleSet?.disabledRuleIds.includes(record.id) ||
                    activeRuleSet?.disabledRuleIds.includes(record.ruleId || "");
                const enabled = !isOverridden;

                return (
                    <Space>
                        <Switch
                            size="small"
                            checked={enabled}
                            loading={overrideMutation.isPending && overrideMutation.variables?.ruleId === (record.ruleId || record.id)}
                            onChange={(checked) => overrideMutation.mutate({ ruleId: record.ruleId || record.id, enabled: checked })}
                        />
                        <Tag color={enabled ? "success" : "default"}>{enabled ? "Enabled" : "Disabled"}</Tag>
                    </Space>
                );
            }
        },
        {
            title: "Severity",
            dataIndex: "severity",
            key: "severity",
            render: (sev: string) => (
                <Tag color={sev === "CRITICAL" ? "red" : sev === "ERROR" ? "orange" : "blue"} className="text-[10px]">
                    {sev}
                </Tag>
            )
        }
    ];

    if (ruleSetsLoading || rulesLoading) return <div className="flex justify-center p-12"><Spin size="large" /></div>;

    return (
        <>
            <div className="space-y-6">
                <div className="flex gap-4 h-[500px]">
                    {/* Left Sidebar - Rule Sets */}
                    <div className="w-64 border-r border-slate-100 pr-4 space-y-2 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Policies</h3>
                            <Button type="text" size="small" icon={<Plus className="h-3 w-3" />} onClick={() => setIsCreateModalOpen(true)} />
                        </div>

                        {ruleSets.length === 0 ? (
                            <div className="text-center py-8">
                                <Empty description="No rule sets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                <Button type="primary" size="small" ghost className="mt-2 text-xs" onClick={() => setIsCreateModalOpen(true)}>Create First</Button>
                            </div>
                        ) : ruleSets.map(rs => (
                            <div
                                key={rs.id}
                                className={cn(
                                    "p-3 rounded-xl cursor-pointer transition-all border group",
                                    activeRuleSetId === rs.id
                                        ? "bg-primary/5 border-primary/20 shadow-sm"
                                        : "bg-white border-transparent hover:bg-slate-50"
                                )}
                                onClick={() => setActiveRuleSetId(rs.id)}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="font-bold text-sm truncate pr-2">{rs.name}</div>
                                    {activeRuleSetId === rs.id && (
                                        <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                                    )}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 line-clamp-1">{rs.description}</div>
                                <div className="flex items-center justify-between mt-2">
                                    <Badge count={rs.ruleIds.length - rs.disabledRuleIds.length} overflowCount={999} style={{ backgroundColor: '#10b981', fontSize: '8px' }} />
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 flex items-center justify-center"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteMutation.mutate(rs.id);
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Content - Rules in Set */}
                    <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                        {activeRuleSet ? (
                            <>
                                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-100 rounded-lg">
                                            <ShieldCheck className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-lg">{activeRuleSet.name}</h2>
                                            <p className="text-xs text-slate-500">{activeRuleSet.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Search rules..."
                                            prefix={<Search className="h-3 w-3" />}
                                            size="small"
                                            className="w-40 rounded-lg"
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                        <Select
                                            size="small"
                                            defaultValue="all"
                                            className="w-32 rounded-lg"
                                            onChange={val => setFilterCategory(val)}
                                            options={categories.map(c => ({ label: c === "all" ? "All Categories" : c, value: c }))}
                                        />
                                    </div>
                                </div>

                                <Table
                                    dataSource={filteredRules}
                                    columns={columns as any}
                                    size="small"
                                    pagination={{ pageSize: 20 }}
                                    rowKey="id"
                                    className="border border-slate-100 rounded-xl overflow-hidden shadow-sm"
                                />
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <Shield className="h-12 w-12 mb-4 opacity-20" />
                                <p>Select a rule set to manage granular overrides</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                open={isCreateModalOpen}
                onCancel={() => setIsCreateModalOpen(false)}
                onOk={handleCreateRuleSet}
                confirmLoading={createMutation.isPending}
                title="Create New Rule Set"
                okText="Create Set"
            >
                <Form form={createForm} layout="vertical" className="pt-4">
                    <Form.Item name="name" label="Rule Set Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. PCI Compliance Overrides" />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea placeholder="Explain why this rule set exists..." rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
