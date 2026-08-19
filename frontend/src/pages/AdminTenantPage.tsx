import React, { useState } from "react";
import { Table, Modal, Button, Tag, Spin, List, Input, Select, Form, App, Space, Switch, Divider, Card, Tabs, Steps } from "antd";
import { Eye, Search, Edit2, Shield, Users, CreditCard, Building2, Globe, Mail, Phone, ChevronRight, Settings, Check, BrainCircuit } from "lucide-react";
import TenantMemberList from "@/components/TenantMemberList";
import TenantPaymentInfo from "@/components/TenantPaymentInfo";
import TenantRuleSetsPanel from "@/components/TenantRuleSetsPanel";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const COMPANY_CATEGORIES = ["Private", "Partnership", "Share Company (SC)", "Government", "NGO / Non-Profit", "Foreign Company", "Other"];
const COMPANY_INDUSTRIES = ["Information Technology", "Education", "Healthcare", "Manufacturing", "Finance & Banking", "Retail & Commerce", "Telecommunications", "Agriculture", "Construction", "Transport & Logistics", "Media & Entertainment", "Energy & Utilities", "Other"];

interface Tenant {
    id: string;
    name: string;
    website: string;
    contactEmail: string;
    isActive: boolean;
    createdAt: string;
    // These come from the flattened List view in backend
    plan?: string;
    membersCount?: number;
}

interface TenantDetail {
    id: string;
    name: string;
    legalName: string;
    domain: string;
    contactPhone: string;
    contactEmail: string;
    address: string;
    industry: string;
    manager: string;
    isActive: boolean;
    isProfileComplete: boolean;
    onboardingStep: number;
    createdAt: string;
    paymentInfo?: { plan: string; status: string; nextPaymentDate: string; amount: number };
    subscriptions: Array<{ serviceName: string; subscribedAt: string; expiration?: string }>;
    members: Array<{ email: string; role: string; joinedAt: string }>;
    mlDetectionEnabled: boolean;
    wafMode: string;
}

export default function AdminTenantPage() {
    const { notification } = App.useApp();
    const queryClient = useQueryClient();
    const { user, isLoading: authLoading } = useAuth();
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Filter states
    const [searchText, setSearchText] = useState("");
    const [planFilter, setPlanFilter] = useState<string | undefined>(undefined);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

    const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [form] = Form.useForm();
    const [createForm] = Form.useForm();

    const [currentStep, setCurrentStep] = useState(0);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

    const { data: templates = [] } = useQuery<any[]>({
        queryKey: ["rule-templates-simple"],
        queryFn: async () => {
            const res = await fetch("/api/templates", { headers });
            if (!res.ok) throw new Error("Failed to fetch templates");
            return res.json();
        },
        enabled: isCreateModalOpen
    });

    const { data, isLoading, error } = useQuery<{ total: number, tenants: Tenant[] }>({
        queryKey: ["admin-tenants", searchText, planFilter, statusFilter, pagination.current, pagination.pageSize],
        queryFn: async () => {
            const params = new URLSearchParams({
                search: searchText,
                page: pagination.current.toString(),
                pageSize: pagination.pageSize.toString(),
            });
            if (planFilter) params.append("plan", planFilter);
            if (statusFilter) params.append("status", statusFilter);

            const res = await fetch(`/api/admin/tenants?${params.toString()}`, { headers });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`API Error (${res.status}): ${errBody || res.statusText}`);
            }
            const json = await res.json();
            // Normalize: handle both array (legacy) and paginated object responses
            if (Array.isArray(json)) {
                return { tenants: json, total: json.length, page: 1, pageSize: json.length };
            }
            return {
                tenants: json.tenants ?? json.Tenants ?? [],
                total: json.total ?? json.Total ?? 0,
                page: json.page ?? json.Page ?? 1,
                pageSize: json.pageSize ?? json.PageSize ?? 10,
            };
        },
        enabled: !!user,
        retry: 1,
    });

    const { data: tenantDetail, isLoading: detailLoading } = useQuery<TenantDetail>({
        queryKey: ["tenant-detail", selectedTenantId],
        queryFn: async () => {
            const res = await fetch(`/api/tenant/${selectedTenantId}`, { headers });
            if (!res.ok) throw new Error("Failed to fetch tenant detail");
            return res.json();
        },
        enabled: !!selectedTenantId,
    });

    const impersonateMutation = useMutation({
        mutationFn: async (tenantId: string) => {
            const res = await fetch(`/api/admin/impersonate/${tenantId}`, {
                method: "POST",
                headers,
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to impersonate tenant");
            }
            return res.json();
        },
        onSuccess: (data) => {
            // Apply the impersonated token to local storage and force reload
            localStorage.setItem("auth_token", data.token);
            notification.success({
                message: "Impersonation Active",
                description: `You are now masquerading as ${data.tenant.name}.`
            });
            // Redirect to home dashboard in impersonated context
            window.location.href = "/";
        },
        onError: (error: any) => {
            notification.error({ message: "Impersonation Failed", description: error.message });
        }
    });

    const createMutation = useMutation({
        mutationFn: async (values: any) => {
            const res = await fetch("/api/tenant", {
                method: "POST",
                headers,
                body: JSON.stringify(values),
            });
            if (!res.ok) throw new Error("Failed to create tenant");
            return res.json();
        },
        onSuccess: async (data) => {
            notification.success({ message: "Tenant Created", description: "Organization profile provisioned successfully." });

            // Check if template needs to be pre-applied
            if (selectedTemplateId) {
                try {
                    const applyRes = await fetch(`/api/templates/${selectedTemplateId}/apply/${data.id}`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({}),
                    });
                    if (applyRes.ok) {
                        const applyData = await applyRes.json();
                        notification.success({
                            message: "Security Policy Applied",
                            description: `Golden Image successfully deployed with ${applyData.ruleCount} custom rule assignments.`
                        });
                    }
                } catch (e) {
                    notification.error({ message: "Template Application Failed", description: "Default security preset could not be applied automatically." });
                }
            }

            queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
            setIsCreateModalOpen(false);
            createForm.resetFields();
            setCurrentStep(0);
            setSelectedTemplateId(null);
            setSelectedTenantId(data.id);
            setModalOpen(true);
        },
        onError: (err: any) => {
            notification.error({ message: "Creation Failed", description: err.message });
        }
    });

    const handleCreateTenant = () => {
        createForm.validateFields().then(values => {
            // Map values to expected backend payload
            const payload = {
                name: values.name,
                legalName: values.legalName,
                domain: values.domain,
                tinNo: values.tinNo,
                licenseNo: values.licenseNo,
                category: values.category,
                industry: values.industry,
                address: values.address,
                adminName: values.adminName,
                adminEmail: values.adminEmail,
                adminPhone: values.adminPhone,
                adminPassword: values.adminPassword,
            };
            createMutation.mutate(payload);
        });
    };

    const nextStep = async () => {
        try {
            if (currentStep === 0) {
                await createForm.validateFields(["name", "legalName", "tinNo", "licenseNo", "category", "industry", "address", "domain"]);
            } else if (currentStep === 2) {
                await createForm.validateFields(["adminName", "adminEmail", "adminPhone", "adminPassword"]);
            }
            setCurrentStep(prev => prev + 1);
        } catch (e) {
            // Step validation failed, form shows error inline
        }
    };

    const prevStep = () => {
        setCurrentStep(prev => Math.max(0, prev - 1));
    };

    const updateMutation = useMutation({
        mutationFn: async (values: any) => {
            const res = await fetch(`/api/tenant/${selectedTenantId}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(values),
            });
            if (!res.ok) throw new Error("Failed to update tenant");
            return res;
        },
        onSuccess: () => {
            notification.success({ message: "Tenant Updated", description: "The tenant profile has been successfully saved." });
            queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
            queryClient.invalidateQueries({ queryKey: ["tenant-detail", selectedTenantId] });
            setIsEditing(false);
        },
        onError: (err: any) => {
            notification.error({ message: "Update Failed", description: err.message });
        }
    });

    const handleEdit = () => {
        if (tenantDetail) {
            form.setFieldsValue({
                name: tenantDetail.name,
                legalName: tenantDetail.legalName,
                domain: tenantDetail.domain,
                contactEmail: tenantDetail.contactEmail,
                contactPhone: tenantDetail.contactPhone,
                address: tenantDetail.address,
                industry: tenantDetail.industry,
                isActive: tenantDetail.isActive,
            });
            setIsEditing(true);
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            updateMutation.mutate(values);
        } catch (e) {
            // form validation failed
        }
    };

    const columns = [
        {
            title: "Organization",
            key: "org",
            render: (_: any, record: Tenant) => (
                <div className="flex flex-col">
                    <span className="font-semibold text-slate-900">{record.name}</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {record.website || "No website"}
                    </span>
                </div>
            )
        },
        {
            title: "Status",
            dataIndex: "isActive",
            key: "isActive",
            render: (active: boolean) => (
                <Tag color={active ? "success" : "error"} className="rounded-full px-3">
                    {active ? "Active" : "Suspended"}
                </Tag>
            )
        },
        {
            title: "Plan",
            dataIndex: "plan",
            key: "plan",
            render: (plan: string) => {
                const planVal = plan || "Free";
                const color = planVal === "Enterprise" ? "gold" : planVal === "Professional" ? "blue" : "default";
                return <Tag color={color}>{planVal}</Tag>;
            }
        },
        {
            title: "Contact",
            dataIndex: "contactEmail",
            key: "contactEmail",
            render: (email: string) => (
                <span className="text-slate-600 flex items-center gap-1 text-sm">
                    <Mail className="h-3.5 w-3.5" /> {email}
                </span>
            )
        },
        {
            title: "Created",
            dataIndex: "createdAt",
            key: "createdAt",
            render: (date: string) => <span className="text-slate-500 text-sm">{new Date(date).toLocaleDateString()}</span>
        },
        {
            title: "Actions",
            key: "actions",
            align: "right" as const,
            render: (_: any, record: Tenant) => (
                <div className="flex gap-2">
                    <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<Eye className="h-3.5 w-3.5" />}
                        className="flex items-center gap-2 hover:bg-primary/5 border-primary/20"
                        onClick={() => {
                            setSelectedTenantId(record.id);
                            setModalOpen(true);
                            setIsEditing(false);
                        }}
                    >
                        Management
                    </Button>
                </div>
            ),
        },
    ];

    if (authLoading) {
        return <div className="flex items-center justify-center h-[60vh]"><Spin size="large" /></div>;
    }

    return (
        <div className="p-8 space-y-8 bg-[#f8fbff] min-h-screen">
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5" />
                    <div className="flex-1 text-sm font-medium">
                        Critical Runtime Error: {error instanceof Error ? error.message : "Failed to synchronize with administrative backend."}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        Tenant Directory
                        {data?.tenants && <Tag color="blue" className="ml-2 font-mono">API: {data.tenants.length} / {data.total}</Tag>}
                    </h1>
                    <p className="text-slate-500 mt-1">Manage global organizations, subscriptions, and security policies.</p>
                </div>
                <div className="flex gap-3">
                    <Button
                        type="primary"
                        size="large"
                        className="bg-primary hover:bg-primary/90 shadow-md shadow-primary/20"
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        Onboard New Tenant
                    </Button>
                </div>
            </div>

            {/* Create Tenant Wizard Modal */}
            <Modal
                open={isCreateModalOpen}
                onCancel={() => {
                    setIsCreateModalOpen(false);
                    createForm.resetFields();
                    setCurrentStep(0);
                    setSelectedTemplateId(null);
                }}
                footer={[
                    <Button key="cancel" onClick={() => {
                        setIsCreateModalOpen(false);
                        createForm.resetFields();
                        setCurrentStep(0);
                        setSelectedTemplateId(null);
                    }}>
                        Cancel
                    </Button>,
                    currentStep > 0 && (
                        <Button key="back" onClick={prevStep}>
                            Back
                        </Button>
                    ),
                    currentStep < 3 && (
                        <Button key="next" type="primary" onClick={nextStep}>
                            Next Step
                        </Button>
                    ),
                    currentStep === 3 && (
                        <Button
                            key="submit"
                            type="primary"
                            loading={createMutation.isPending}
                            onClick={handleCreateTenant}
                            className="bg-primary hover:bg-primary/95 text-white"
                        >
                            Provision Organization & Policy
                        </Button>
                    )
                ]}
                title={
                    <div className="flex items-center gap-3 py-1">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <div className="text-lg font-bold">Onboard New Tenant</div>
                            <div className="text-xs text-slate-500 font-normal">Establish a new organization profile with instant security policies.</div>
                        </div>
                    </div>
                }
                width={800}
                className="rounded-3xl"
                centered
            >
                <div className="py-4 space-y-6">
                    <Steps
                        current={currentStep}
                        size="small"
                        items={[
                            { title: "Identity", description: "Legal status" },
                            { title: "Preset", description: "Security profile" },
                            { title: "Admin", description: "Manager account" },
                            { title: "Confirm", description: "Inspect plan" }
                        ]}
                    />

                    <Form form={createForm} layout="vertical" className="pt-2">
                        {currentStep === 0 && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                <Form.Item name="name" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trade Name</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="Short company name / brand" className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="legalName" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Legal Entity Name</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="As per Ethiopian business license" className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="tinNo" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">TIN Number</span>} rules={[{ required: true, len: 10, message: "Must be a 10 digit number" }]}>
                                    <Input placeholder="10 Digits" maxLength={10} className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="licenseNo" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Business License No.</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="Federal registration ID" className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="category" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ownership Category</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Select placeholder="Select Type" className="h-10 rounded-xl">
                                        {COMPANY_CATEGORIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                                <Form.Item name="industry" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Industry Sector</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Select placeholder="Select Sector" className="h-10 rounded-xl">
                                        {COMPANY_INDUSTRIES.map(i => <Select.Option key={i} value={i}>{i}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                                <Form.Item name="domain" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Primary System Domain</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="e.g. portal.acme.gov.et" className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="address" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Headquarters Address</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="City, Subcity, Woreda, Building" className="rounded-xl h-10" />
                                </Form.Item>
                            </div>
                        )}

                        {currentStep === 1 && (
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-semibold text-slate-800 text-sm">Select Golden Image Preset</h4>
                                        <p className="text-xs text-slate-500">Deploy predefined security configuration policies instantly.</p>
                                    </div>
                                    {selectedTemplateId && (
                                        <Button type="link" danger onClick={() => setSelectedTemplateId(null)}>Clear Selection</Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-1">
                                    {templates.map((tpl: any) => {
                                        const isSelected = selectedTemplateId === tpl.id;
                                        return (
                                            <Card
                                                key={tpl.id}
                                                hoverable
                                                onClick={() => setSelectedTemplateId(tpl.id)}
                                                className={cn(
                                                    "rounded-xl transition-all border cursor-pointer",
                                                    isSelected ? "border-primary bg-primary/[0.02] shadow-sm" : "border-slate-100 bg-white"
                                                )}
                                                bodyStyle={{ padding: "16px" }}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tpl.category}</span>
                                                    {isSelected && (
                                                        <div className="p-1 bg-primary text-white rounded-full">
                                                            <Check className="h-3 w-3" />
                                                        </div>
                                                    )}
                                                </div>
                                                <h5 className="font-bold text-slate-900 text-sm mb-1">{tpl.name}</h5>
                                                <p className="text-xs text-slate-500 line-clamp-2 italic mb-2">{tpl.description}</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {(tpl.ruleCategories || []).slice(0, 3).map((c: string) => (
                                                        <Tag key={c} color="default" className="text-[9px] m-0">{c}</Tag>
                                                    ))}
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                <Form.Item name="adminName" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Administrator Full Name</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="General Manager Name" className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="adminEmail" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</span>} rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
                                    <Input placeholder="admin@acme.com" className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="adminPhone" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone Number</span>} rules={[{ required: true, message: "Required" }]}>
                                    <Input placeholder="+251..." className="rounded-xl h-10" />
                                </Form.Item>
                                <Form.Item name="adminPassword" label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal Password</span>} rules={[{ required: true, min: 6, message: "Min 6 characters required" }]}>
                                    <Input.Password placeholder="Secure passcode" className="rounded-xl h-10" />
                                </Form.Item>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                                    <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                                    <span className="text-sm font-semibold text-emerald-800">Please review the configuration details before finalizing the onboarding.</span>
                                </div>

                                <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <div>
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Organization Info</h4>
                                        <div className="space-y-2 text-sm">
                                            <div><span className="text-slate-500">Short Name:</span> <strong className="text-slate-800">{createForm.getFieldValue("name")}</strong></div>
                                            <div><span className="text-slate-500">Legal Name:</span> <span className="text-slate-700">{createForm.getFieldValue("legalName")}</span></div>
                                            <div><span className="text-slate-500">Domain:</span> <span className="text-slate-700 font-mono">{createForm.getFieldValue("domain")}</span></div>
                                            <div><span className="text-slate-500">TIN Number:</span> <span className="text-slate-700">{createForm.getFieldValue("tinNo")}</span></div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Gateway Plan</h4>
                                        <div className="space-y-2 text-sm">
                                            <div><span className="text-slate-500">Security Profile:</span> <strong className="text-primary">{selectedTemplateId ? templates.find(t => t.id === selectedTemplateId)?.name : "Standard Defaults"}</strong></div>
                                            <div><span className="text-slate-500">Administrator:</span> <span className="text-slate-700">{createForm.getFieldValue("adminName")}</span></div>
                                            <div><span className="text-slate-500">Contact Email:</span> <span className="text-slate-700 font-semibold">{createForm.getFieldValue("adminEmail")}</span></div>
                                            <div><span className="text-slate-500">Initial Plan:</span> <Tag color="blue" className="m-0 font-bold uppercase text-[10px]">Free Tier</Tag></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Form>
                </div>
            </Modal>

            <Card className="rounded-2xl shadow-md border-slate-100 overflow-visible" bodyStyle={{ padding: 0 }}>
                <div className="p-5 bg-white border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex flex-wrap gap-4 flex-1">
                        <Input
                            placeholder="Search by name, email, or domain..."
                            prefix={<Search className="h-4 w-4 text-slate-400" />}
                            className="max-w-md rounded-xl"
                            allowClear
                            onChange={(e) => {
                                setSearchText(e.target.value);
                                setPagination({ ...pagination, current: 1 });
                            }}
                        />
                        <Select
                            placeholder="Plan"
                            allowClear
                            className="w-40 rounded-xl"
                            onChange={(val) => {
                                setPlanFilter(val);
                                setPagination({ ...pagination, current: 1 });
                            }}
                            options={[
                                { label: "Free", value: "free" },
                                { label: "Professional", value: "professional" },
                                { label: "Enterprise", value: "enterprise" },
                            ]}
                        />
                        <Select
                            placeholder="Status"
                            allowClear
                            className="w-40 rounded-xl"
                            onChange={(val) => {
                                setStatusFilter(val);
                                setPagination({ ...pagination, current: 1 });
                            }}
                            options={[
                                { label: "Active Only", value: "active" },
                                { label: "Suspended Only", value: "suspended" },
                            ]}
                        />
                    </div>
                    <div className="text-sm text-slate-500 font-medium">
                        Total: <span className="text-primary">{data?.total || 0}</span> organizations
                    </div>
                </div>

                <Table
                    dataSource={data?.tenants || []}
                    columns={columns as any}
                    rowKey="id"
                    loading={isLoading}
                    pagination={{
                        ...pagination,
                        total: data?.total || 0,
                        onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                        showSizeChanger: true,
                        position: ["topRight"],
                        className: "pr-6 py-4",
                    }}
                    className="admin-tenant-table"
                />
            </Card>

            <Modal
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    setIsEditing(false);
                }}
                footer={isEditing ? [
                    <Button key="cancel" onClick={() => setIsEditing(false)}>Cancel</Button>,
                    <Button key="save" type="primary" onClick={handleSave} loading={updateMutation.isPending}>Save Changes</Button>
                ] : [
                    <Button key="close" onClick={() => setModalOpen(false)}>Close</Button>,
                    <Button key="edit" type="primary" icon={<Edit2 className="h-3 w-3" />} onClick={handleEdit}>Edit Profile</Button>
                ]}
                title={
                    <div className="flex items-center gap-3 py-2">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <div className="text-lg font-bold">{tenantDetail?.name || "Loading..."}</div>
                            <div className="text-xs text-slate-500 font-normal">Tenant ID: {selectedTenantId}</div>
                        </div>
                    </div>
                }
                width={1000}
                className="rounded-3xl overflow-hidden"
                centered
            >
                <Tabs
                    defaultActiveKey="profile"
                    className="admin-management-tabs"
                    items={[
                        {
                            key: "profile",
                            label: <span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Profile</span>,
                            children: (
                                <div className={cn("space-y-6 py-4", isEditing ? "px-2" : "")}>
                                    {detailLoading ? (
                                        <div className="flex justify-center py-12"><Spin size="large" /></div>
                                    ) : tenantDetail ? (
                                        <>
                                            {/* Onboarding Milestones progress indicator */}
                                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-6">
                                                <h4 className="text-[10px] font-bold text-slate-405 uppercase tracking-widest mb-4 text-slate-400">Onboarding Milestones</h4>
                                                <Steps
                                                    size="small"
                                                    current={(tenantDetail.onboardingStep ?? 1) - 1}
                                                    items={[
                                                        { title: "Registration", description: "Identity & Profile" },
                                                        { title: "Security Baseline", description: tenantDetail.subscriptions?.length ? "Preset Applied" : "Pending rules" },
                                                        { title: "Domain Setup", description: tenantDetail.domain ? "Domain Linked" : "No active domain" },
                                                        { title: "Dashboard Ready", description: tenantDetail.isActive ? "Active Status" : "Suspended" }
                                                    ]}
                                                />
                                            </div>

                                            isEditing ? (
                                            <Form form={form} layout="vertical" className="grid grid-cols-2 gap-x-6 gap-y-2">
                                                <Form.Item name="name" label="Organization Name" rules={[{ required: true }]}>
                                                    <Input prefix={<Building2 className="h-4 w-4 text-slate-400" />} />
                                                </Form.Item>
                                                <Form.Item name="legalName" label="Legal Business Name">
                                                    <Input prefix={<Building2 className="h-4 w-4 text-slate-400" />} />
                                                </Form.Item>
                                                <Form.Item name="domain" label="Primary Website/Domain">
                                                    <Input prefix={<Globe className="h-4 w-4 text-slate-400" />} placeholder="example.com" />
                                                </Form.Item>
                                                <Form.Item name="industry" label="Industry Sector">
                                                    <Select options={[
                                                        { label: "Technology", value: "Technology" },
                                                        { label: "Finance", value: "Finance" },
                                                        { label: "Healthcare", value: "Healthcare" },
                                                        { label: "E-commerce", value: "E-commerce" },
                                                        { label: "Government", value: "Government" },
                                                    ]} />
                                                </Form.Item>
                                                <Form.Item name="contactEmail" label="Administrative Email" rules={[{ type: 'email' }]}>
                                                    <Input prefix={<Mail className="h-4 w-4 text-slate-400" />} />
                                                </Form.Item>
                                                <Form.Item name="contactPhone" label="Administrative Phone">
                                                    <Input prefix={<Phone className="h-4 w-4 text-slate-400" />} />
                                                </Form.Item>
                                                <Form.Item name="address" label="Business Address" className="col-span-2">
                                                    <Input.TextArea rows={2} />
                                                </Form.Item>
                                                <Form.Item name="isActive" label="Account Status" valuePropName="checked" className="col-span-2">
                                                    <Space direction="horizontal" className="w-full bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200">
                                                        <Switch />
                                                        <div>
                                                            <div className="font-semibold">{form.getFieldValue("isActive") ? "Account Active" : "Account Suspended"}</div>
                                                            <div className="text-xs text-slate-500">Suspended tenants cannot access their dashboard and WAF logs.</div>
                                                        </div>
                                                    </Space>
                                                </Form.Item>
                                            </Form>
                                            ) : (
                                            <div className="grid grid-cols-3 gap-6">
                                                <Card size="small" className="col-span-2 rounded-2xl border-slate-100 shadow-sm">
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center">
                                                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Company Identity</h3>
                                                            <Tag color={tenantDetail.isActive ? "success" : "error"}>{tenantDetail.isActive ? "Active" : "Suspended"}</Tag>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-y-4 text-sm">
                                                            <div><div className="text-slate-500 text-xs">Legal Name</div><div className="font-medium">{tenantDetail.legalName || "-"}</div></div>
                                                            <div><div className="text-slate-500 text-xs">Industry</div><div className="font-medium">{tenantDetail.industry || "-"}</div></div>
                                                            <div><div className="text-slate-500 text-xs">Website</div><div className="font-medium text-primary flex items-center gap-1 cursor-pointer">{tenantDetail.domain} <ChevronRight className="h-3 w-3" /></div></div>
                                                            <div><div className="text-slate-500 text-xs">Manager</div><div className="font-medium">{tenantDetail.manager || "Owner"}</div></div>
                                                            <div className="col-span-2"><div className="text-slate-500 text-xs">Address</div><div className="font-medium">{tenantDetail.address || "-"}</div></div>
                                                        </div>

                                                        <Divider style={{ margin: '12px 0' }} />

                                                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Contact Details</h3>
                                                        <div className="grid grid-cols-2 gap-y-4 text-sm">
                                                            <div><div className="text-slate-500 text-xs">Email Address</div><div className="font-medium">{tenantDetail.contactEmail}</div></div>
                                                            <div><div className="text-slate-500 text-xs">Phone Number</div><div className="font-medium">{tenantDetail.contactPhone || "-"}</div></div>
                                                        </div>
                                                    </div>
                                                </Card>

                                                <Card size="small" className="rounded-2xl border-slate-100 shadow-sm bg-slate-50/50">
                                                    <div className="space-y-4">
                                                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                            <CreditCard className="h-4 w-4" /> Billing
                                                        </h3>
                                                        {tenantDetail.paymentInfo ? (
                                                            <TenantPaymentInfo payment={tenantDetail.paymentInfo} />
                                                        ) : <div className="text-slate-400 text-sm italic">No payment info found</div>}

                                                        <Divider style={{ margin: '12px 0' }} />

                                                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                            <Shield className="h-4 w-4" /> Services
                                                        </h3>
                                                        <List
                                                            dataSource={tenantDetail.subscriptions || []}
                                                            renderItem={svc => (
                                                                <div className="flex justify-between items-center py-2 text-sm border-b last:border-0 border-slate-100">
                                                                    <span className="font-medium">{svc.serviceName}</span>
                                                                    <span className="text-[10px] bg-slate-200 px-1.5 rounded uppercase font-bold text-slate-500">Active</span>
                                                                </div>
                                                            )}
                                                        />
                                                    </div>
                                                </Card>

                                                <Card size="small" className="col-span-3 rounded-2xl border-slate-100 shadow-sm">
                                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                        <Users className="h-4 w-4" /> Team Members
                                                    </h3>
                                                    <TenantMemberList members={tenantDetail.members || []} />
                                                </Card>
                                            </div>
                                            )
                                        </>
                                    ) : null}
                                </div>
                            )
                        },
                        {
                            key: "rulesets",
                            label: <span className="flex items-center gap-2"><Settings className="h-4 w-4" /> Rule Sets</span>,
                            children: (
                                <div className="py-4">
                                    {selectedTenantId && <TenantRuleSetsPanel tenantId={selectedTenantId} />}
                                </div>
                            )
                        },
                        {
                            key: "waf-ai-engine",
                            label: <span className="flex items-center gap-2"><BrainCircuit className="h-4 w-4" /> AI Engine</span>,
                            children: (
                                <div className="py-4">
                                    {selectedTenantId && (
                                        <TenantAiEnginePanel
                                            tenantId={selectedTenantId}
                                            tenantDetail={tenantDetail}
                                            headers={headers}
                                            onSuccess={() => {
                                                queryClient.invalidateQueries({ queryKey: ["tenant-detail", selectedTenantId] });
                                                queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
                                            }}
                                        />
                                    )}
                                </div>
                            )
                        }
                    ]}
                />
            </Modal>
        </div >
    );
}

interface TenantAiEnginePanelProps {
    tenantId: string;
    tenantDetail?: TenantDetail;
    headers: any;
    onSuccess: () => void;
}

function TenantAiEnginePanel({ tenantId, tenantDetail, headers, onSuccess }: TenantAiEnginePanelProps) {
    const { notification } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [mlDetectionEnabled, setMlDetectionEnabled] = useState(tenantDetail?.mlDetectionEnabled ?? true);
    const [wafMode, setWafMode] = useState(tenantDetail?.wafMode ?? "detection");

    React.useEffect(() => {
        if (tenantDetail) {
            setMlDetectionEnabled(tenantDetail.mlDetectionEnabled);
            setWafMode(tenantDetail.wafMode);
        }
    }, [tenantDetail]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/tenant/${tenantId}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    mlDetectionEnabled,
                    wafMode
                })
            });
            if (!res.ok) throw new Error("Failed to update AI Engine settings");
            notification.success({
                message: "AI Engine Configuration Saved",
                description: "Tenant policies have been successfully updated and pushed to edge nodes."
            });
            onSuccess();
        } catch (e: any) {
            notification.error({
                message: "Configuration Saved Error",
                description: e.message || "Failed to update security settings"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="rounded-2xl border-slate-100 shadow-sm">
            <div className="space-y-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <BrainCircuit className="h-5 w-5 text-primary" /> AI & Semantic Security
                    </h3>
                    <p className="text-slate-500 text-sm mt-1">
                        Configure deep security inspection and real-time machine learning threat protection parameters for this tenant.
                    </p>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl border border-slate-100">
                    <div className="space-y-1">
                        <span className="font-semibold text-slate-900 block text-sm">AI Semantic Engine</span>
                        <span className="text-xs text-slate-500 block max-w-lg">
                            Dual-pass protection: requests passing core matching rules are analyzed by the AI models to detect zero-day XSS/SQLi.
                        </span>
                    </div>
                    <Switch
                        checked={mlDetectionEnabled}
                        onChange={(checked) => setMlDetectionEnabled(checked)}
                    />
                </div>

                <div className="space-y-2">
                    <label className="font-semibold text-slate-950 text-sm block">WAF Operation Mode</label>
                    <span className="text-xs text-slate-500 block mb-2">
                        Determine whether threats detected by the rules engine or semantic model should be actively blocked.
                    </span>
                    <Select
                        className="w-full"
                        value={wafMode}
                        onChange={(val) => setWafMode(val)}
                        options={[
                            { value: "detection", label: "Simulation (Detection Only) - Log blocks but do not drop traffic" },
                            { value: "prevention", label: "Enforcement (Prevention Mode) - Block traffic exceeding anomaly threshold" }
                        ]}
                    />
                </div>

                <div className="flex justify-end pt-4 flex-row gap-2">
                    <Button
                        type="primary"
                        loading={loading}
                        onClick={handleSave}
                        className="bg-primary hover:bg-primary/95 text-white"
                    >
                        Save Configuration
                    </Button>
                </div>
            </div>
        </Card>
    );
}

