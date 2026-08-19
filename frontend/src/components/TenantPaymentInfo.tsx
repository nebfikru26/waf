import React from "react";
import { Descriptions } from "antd";

interface PaymentInfo {
    plan: string;
    status?: string;
    nextPaymentDate: string;
    amount?: number;
}

interface TenantPaymentInfoProps {
    payment: PaymentInfo;
}

export default function TenantPaymentInfo({ payment }: TenantPaymentInfoProps) {
    return (
        <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Plan">{payment.plan}</Descriptions.Item>
            {payment.status && (
                <Descriptions.Item label="Status">{payment.status}</Descriptions.Item>
            )}
            <Descriptions.Item label="Next Payment">
                {new Date(payment.nextPaymentDate).toLocaleDateString()}
            </Descriptions.Item>
            {payment.amount !== undefined && (
                <Descriptions.Item label="Amount">{payment.amount} ETB</Descriptions.Item>
            )}
        </Descriptions>
    );
}
