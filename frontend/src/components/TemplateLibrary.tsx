import React, { useState } from "react";
import { Card, Button, Tag, Spin, Row, Col, Modal, Select, App, Divider, Badge, Alert, Form, Input, Checkbox } from "antd";
import { Shield, LayoutGrid, Plus, Copy, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Template {
    id: string;
    name: string;
    description: string;
    category: string;
    ruleCategories: string[];
    ruleCount: number;
    isBuiltIn: boolean;
    createdAt: string;
}

interface Tenant {
    id: string;
    name: string;
    domain: string;
}

interface TemplateLibraryProps {
    embedded?: boolean;
}

const TEMPLATE_CATEGORIES = [
    "Finance",
    "E-Commerce",
    "API",
    "CMS",
    "Healthcare",
    "Government",
    "General",
];

const RULE_CATEGORY_OPTIONS = [
    "SQL Injection",
    "Cross-Site Scripting",
    "Remote Code Execution",
    "Local File Inclusion",
    "Remote File Inclusion",
    "PHP Injection",
    "Java Injection",
    "Scanner Detection",
    "Protocol Enforcement",
    "Request Limits",
    "Data Leakage",
    "Session Fixation",
    "SSRF",
    "Bot Detection",
];

export function TemplateLibrary({ embedded = false }: TemplateLibraryProps) {
    const { notification } = App.useApp();
    const queryClient = useQueryClient();
    const [createForm] = Form.useForm();
    const [applyModalOpen, setApplyModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const { data: templates = [], isLoading, error } = useQuery<Template[], Error>({
        queryKey: ["rule-templates-simple"],
        queryFn: async () => {
            const res = await fetch("/api/templates", { headers });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Server Error: ${res.status}`);
            }
            return res.json();
        }
    });

    const { data: tenants = [] } = useQuery<Tenant[]>({
        queryKey: ["admin-tenants-simple"],
        queryFn: async () => {
            const res = await fetch("/api/admin/tenants?pageSize=100", { headers });
            if (!res.ok) throw new Error("Failed to fetch tenants");
            const body = await res.json();
            return body.tenants || [];
        }
    });

    // ── Mutations ────────────────────────────────────────────────────────────

    const createMutation = useMutation({
        mutationFn: async (values: {
            name: string;
            description: string;
            category: string;
            ruleCategories: string[];
        }) => {
            const res = await fetch("/api/templates", {
                method: "POST",
                headers,
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to create template");
            }
            return res.json();
        },
        onSuccess: (data: Template) => {
            notification.success({
                message: "Template Created",
                description: `"${data.name}" has been added to the template library.`,
                placement: "topRight"
            });
            queryClient.invalidateQueries({ queryKey: ["rule-templates-simple"] });
            setIsCreateModalOpen(false);
            createForm.resetFields();
        },
        onError: (err: any) => {
            notification.error({
                message: "Creation Failed",
                description: err.message,
                placement: "topRight"
            });
        }
    });

    const cloneMutation = useMutation({
        mutationFn: async (templateId: string) => {
            const res = await fetch(`/api/templates/${templateId}/clone`, {
                method: "POST",
                headers
            });
            if (!res.ok) throw new Error("Failed to clone template");
            return res.json();
        },
        onSuccess: () => {
            notification.success({
                message: "Template Cloned",
                description: "A new draft has been created from this Golden Image.",
                placement: "topRight"
            });
            queryClient.invalidateQueries({ queryKey: ["rule-templates-simple"] });
        },
        onError: (err: any) => {
            notification.error({
                message: "Clone Failed",
                description: err.message,
                placement: "topRight"
            });
        }
    });

    const applyMutation = useMutation({
        mutationFn: async ({ templateId, tenantId }: { templateId: string, tenantId: string }) => {
            const res = await fetch(`/api/templates/${templateId}/apply/${tenantId}`, {
                method: "POST",
                headers,
                body: JSON.stringify({}),
            });
            if (!res.ok) throw new Error("Failed to apply template");
            return res.json();
        },
        onSuccess: (data) => {
            notification.success({
                message: "Template Applied",
                description: `Successfully created a new rule set with ${data.ruleCount} rules for the target tenant.`
            });
            setApplyModalOpen(false);
            setSelectedTenantId(null);
            queryClient.invalidateQueries({ queryKey: ["tenant-rulesets"] });
        },
        onError: (err: any) => {
            notification.error({ message: "Application Failed", description: err.message });
        }
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    const categoryColor: Record<string, string> = {
        Finance: "gold",
        "E-Commerce": "blue",
        API: "cyan",
        CMS: "purple",
        Healthcare: "green",
        Government: "red",
        General: "default",
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (isLoading) {
        return <div className="flex justify-center py-20"><Spin size="large" /></div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <Alert
                    message="Golden Image Library Error"
                    description={error.message}
                    type="error"
                    showIcon
                />
                <Button className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: ["rule-templates-simple"] })}>
                    Retry Connection
                </Button>
            </div>
        );
    }

    return (
        <div className={`space-y-8 ${embedded ? '' : 'p-4'}`}>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className={`${embedded ? 'text-xl' : 'text-3xl'} font-bold text-slate-900 tracking-tight flex items-center gap-3`}>
                        <LayoutGrid className="h-6 w-6 text-primary" /> Golden Image Templates
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">Pre-configured "Golden Image" security policy presets for rapid tenant onboarding.</p>
                </div>
                <Button
                    type="primary"
                    icon={<Plus className="h-4 w-4" />}
                    className="glow-primary"
                    onClick={() => setIsCreateModalOpen(true)}
                >
                    Create Template
                </Button>
            </div>

            {templates.length === 0 && (
                <div className="py-20 text-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
                    <LayoutGrid className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-500">No Golden Images Found</h3>
                    <p className="text-slate-400 max-w-sm mx-auto mt-2">
                        You haven't created any security templates yet. Start by creating one or seeding the built-in library.
                    </p>
                    <Button type="primary" className="mt-6 glow-primary" onClick={() => setIsCreateModalOpen(true)}>
                        Create First Template
                    </Button>
                </div>
            )}

            <Row gutter={[24, 24]}>
                {templates.map(template => (
                    <Col xs={24} sm={12} lg={embedded ? 12 : 8} key={template.id}>
                        <Card
                            hoverable
                            className="rounded-2xl border-slate-100 shadow-sm transition-all hover:shadow-md h-full flex flex-col"
                            bodyStyle={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-primary/10 rounded-xl">
                                    <Shield className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    {template.isBuiltIn && (
                                        <div className="flex gap-1">
                                            <Tag color="gold" className="rounded-full px-3 text-[10px] font-bold uppercase border-none shadow-sm">Golden Image</Tag>
                                            <Tag color="blue" className="rounded-full px-3 text-[10px] font-bold uppercase">Built-in</Tag>
                                        </div>
                                    )}
                                    <Tag color={categoryColor[template.category] ?? "default"} className="rounded-full px-3 text-[10px] font-bold uppercase">{template.category}</Tag>
                                </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 mb-2">{template.name}</h3>
                            <p className="text-sm text-slate-500 mb-6 flex-1 italic line-clamp-2">{template.description}</p>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                                    <span>Rule Coverage</span>
                                    <span className="text-primary">{template.ruleCategories?.length || 0} Categories</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(template.ruleCategories || []).slice(0, 3).map(cat => (
                                        <Badge
                                            key={cat}
                                            count={cat}
                                            style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '9px', fontWeight: 600, border: '1px solid #e2e8f0' }}
                                        />
                                    ))}
                                    {(template.ruleCategories || []).length > 3 && (
                                        <span className="text-[10px] text-slate-400 font-bold">+{(template.ruleCategories || []).length - 3}</span>
                                    )}
                                </div>
                            </div>

                            <Divider style={{ margin: '0 0 16px 0' }} />

                            <div className="flex gap-2">
                                <Button
                                    className="flex-1 rounded-xl h-9 border-slate-100 flex items-center justify-center text-xs"
                                    icon={<Info className="h-3.5 w-3.5" />}
                                    onClick={() => {
                                        setSelectedTemplate(template);
                                        // Show detail inline (future: inspect modal)
                                    }}
                                >
                                    Inspect
                                </Button>
                                <Button
                                    className="flex-1 rounded-xl h-9 border-slate-100 flex items-center justify-center text-xs"
                                    icon={<Copy className="h-3.5 w-3.5" />}
                                    loading={cloneMutation.isPending}
                                    onClick={() => cloneMutation.mutate(template.id)}
                                >
                                    Clone
                                </Button>
                                <Button
                                    type="primary"
                                    className="flex-1 rounded-xl h-9 glow-primary flex items-center justify-center text-xs font-bold"
                                    onClick={() => {
                                        setSelectedTemplate(template);
                                        setApplyModalOpen(true);
                                    }}
                                >
                                    Apply
                                </Button>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* ── Apply Template Modal ──────────────────────────────────────── */}
            <Modal
                open={applyModalOpen}
                onCancel={() => setApplyModalOpen(false)}
                title={
                    <div className="flex items-center gap-3 py-2">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                            <Copy className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                            <div className="text-lg font-bold">Apply Preset Policy</div>
                            <div className="text-xs text-slate-500 font-normal">Deploying "{selectedTemplate?.name}" to tenant environment.</div>
                        </div>
                    </div>
                }
                footer={[
                    <Button key="cancel" onClick={() => setApplyModalOpen(false)}>Cancel</Button>,
                    <Button
                        key="apply"
                        type="primary"
                        disabled={!selectedTenantId}
                        loading={applyMutation.isPending}
                        onClick={() => selectedTemplate && selectedTenantId && applyMutation.mutate({ templateId: selectedTemplate.id, tenantId: selectedTenantId })}
                        className="glow-primary"
                    >
                        Confirm Application
                    </Button>
                ]}
                className="rounded-3xl"
                centered
            >
                <div className="py-4 space-y-6">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Target Organization</h4>
                        <Select
                            showSearch
                            placeholder="Search by organization name..."
                            className="w-full h-11 rounded-xl"
                            onChange={val => setSelectedTenantId(val)}
                            options={tenants.map(t => ({ label: t.name, value: t.id }))}
                            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Card size="small" className="rounded-xl bg-primary/[0.02] border-primary/10">
                            <p className="text-[9px] uppercase text-slate-400 font-bold mb-1">Source Template</p>
                            <p className="text-xs font-bold text-slate-900 line-clamp-1">{selectedTemplate?.name}</p>
                        </Card>
                        <Card size="small" className="rounded-xl bg-orange-50/50 border-orange-100">
                            <p className="text-[9px] uppercase text-slate-400 font-bold mb-1">Coverage</p>
                            <p className="text-xs font-bold text-slate-900">{selectedTemplate?.ruleCategories?.length || 0} Categories</p>
                        </Card>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <Info className="h-6 w-6 text-amber-500 shrink-0" />
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                            Applying this template will create a new rule set for the tenant. It inherits base protection but allows organization-specific tuning.
                        </p>
                    </div>
                </div>
            </Modal>

            {/* ── Create Template Modal ─────────────────────────────────────── */}
            <Modal
                title={
                    <div className="flex items-center gap-3 py-1">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <Shield className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <div className="text-lg font-bold">New Security Template</div>
                            <div className="text-xs text-slate-500 font-normal">Define a reusable security baseline for tenant onboarding.</div>
                        </div>
                    </div>
                }
                open={isCreateModalOpen}
                onCancel={() => { setIsCreateModalOpen(false); createForm.resetFields(); }}
                footer={[
                    <Button key="cancel" onClick={() => { setIsCreateModalOpen(false); createForm.resetFields(); }}>
                        Cancel
                    </Button>,
                    <Button
                        key="create"
                        type="primary"
                        loading={createMutation.isPending}
                        className="glow-primary"
                        onClick={() => createForm.validateFields().then(vals => createMutation.mutate(vals))}
                    >
                        Create Template
                    </Button>
                ]}
                width={680}
                className="rounded-2xl"
                centered
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    className="pt-4"
                    initialValues={{ ruleCategories: [] }}
                >
                    <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item
                            name="name"
                            label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Template Name</span>}
                            rules={[{ required: true, message: "Please enter a template name" }]}
                        >
                            <Input placeholder="e.g. High-Security Banking" className="rounded-xl h-10" />
                        </Form.Item>

                        <Form.Item
                            name="category"
                            label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</span>}
                            rules={[{ required: true, message: "Please select a category" }]}
                        >
                            <Select placeholder="Select sector" className="h-10 rounded-xl">
                                {TEMPLATE_CATEGORIES.map(c => (
                                    <Select.Option key={c} value={c}>{c}</Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="description"
                        label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</span>}
                        rules={[{ required: true, message: "Please enter a description" }]}
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder="Describe what this template protects against and when to use it..."
                            className="rounded-xl"
                        />
                    </Form.Item>

                    <Form.Item
                        name="ruleCategories"
                        label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rule Coverage</span>}
                        rules={[{
                            required: true,
                            type: "array",
                            min: 1,
                            message: "Select at least one rule category"
                        }]}
                    >
                        <Checkbox.Group className="w-full">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                {RULE_CATEGORY_OPTIONS.map(cat => (
                                    <Checkbox key={cat} value={cat} className="text-sm text-slate-700">
                                        {cat}
                                    </Checkbox>
                                ))}
                            </div>
                        </Checkbox.Group>
                    </Form.Item>

                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100 mt-1">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-blue-700 leading-relaxed">
                            The selected rule categories determine which OWASP CRS rules will be pulled into a tenant's rule set when this template is applied.
                        </p>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
