import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import {
  Hospital,
  User,
  Patient,
  PatientStage,
  Subscription,
  Payment,
  AppNotification,
} from '@/lib/db/models/index';

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

function buildCsv(headers, rows) {
  const headerLine = headers.map(h => escapeCsvValue(h.label)).join(',');
  const rowLines = rows.map(r => headers.map(h => escapeCsvValue(h.getValue(r))).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

// GET /api/provider/reports/export?type=hospitals|revenue|subscriptions|patients_summary|audit_logs&format=csv|json
export async function GET(request) {
  const { errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'hospitals';
    const format = searchParams.get('format') || 'csv';
    const hospitalId = searchParams.get('hospital_id');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const dateFilter = {};
    if (startDate) dateFilter[Op.gte] = new Date(startDate);
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      dateFilter[Op.lte] = e;
    }

    let headers = [];
    let rows = [];
    let filename = `tinitracker_${type}_export_${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);

    // ───────────────────────────────────────────────────────────────────────────
    // 1. HOSPITALS MASTER REGISTRY
    // ───────────────────────────────────────────────────────────────────────────
    if (type === 'hospitals') {
      const where = {};
      if (hospitalId && hospitalId !== 'ALL') where.id = hospitalId;
      if (startDate || endDate) where.createdAt = dateFilter;

      const hospitals = await Hospital.findAll({
        where,
        include: [
          { model: Subscription, attributes: ['plan', 'is_active', 'starts_at', 'ends_at'] },
        ],
        order: [['createdAt', 'DESC']],
      });

      headers = [
        { label: 'Hospital ID', getValue: r => r.id },
        { label: 'Hospital Name', getValue: r => r.name },
        { label: 'Address / Location', getValue: r => r.address || 'N/A' },
        { label: 'Primary Contact Phone', getValue: r => r.phone || 'N/A' },
        { label: 'Email', getValue: r => r.email || 'N/A' },
        { label: 'Operational Status', getValue: r => r.is_blocked ? 'SUSPENDED' : 'ACTIVE' },
        {
          label: 'Subscription Plan',
          getValue: r => {
            const sub = r.Subscriptions?.find(s => s.is_active) || r.Subscriptions?.[0];
            return sub?.plan ? sub.plan.toUpperCase() : 'NO PLAN';
          },
        },
        {
          label: 'Subscription Status',
          getValue: r => {
            const sub = r.Subscriptions?.find(s => s.is_active) || r.Subscriptions?.[0];
            if (!sub) return 'NONE';
            if (!sub.is_active || (sub.ends_at && sub.ends_at < today)) return 'EXPIRED';
            return 'ACTIVE';
          },
        },
        {
          label: 'Start Date',
          getValue: r => {
            const sub = r.Subscriptions?.find(s => s.is_active) || r.Subscriptions?.[0];
            return sub?.starts_at ? new Date(sub.starts_at).toLocaleDateString('en-IN') : 'N/A';
          },
        },
        {
          label: 'End Date / Renewal',
          getValue: r => {
            const sub = r.Subscriptions?.find(s => s.is_active) || r.Subscriptions?.[0];
            return sub?.ends_at ? new Date(sub.ends_at).toLocaleDateString('en-IN') : 'N/A';
          },
        },
        { label: 'Onboarded Date', getValue: r => new Date(r.createdAt).toLocaleDateString('en-IN') },
      ];

      rows = hospitals;
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 2. REVENUE & PAYMENT LEDGER
    // ───────────────────────────────────────────────────────────────────────────
    else if (type === 'revenue') {
      const where = {};
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      if (startDate || endDate) where.payment_date = dateFilter;

      const payments = await Payment.findAll({
        where,
        include: [
          { model: Hospital, attributes: ['id', 'name'] },
          { model: Subscription, attributes: ['id', 'plan'] },
        ],
        order: [['payment_date', 'DESC']],
      });

      headers = [
        { label: 'Payment ID', getValue: r => `PAY-${r.id}` },
        { label: 'Hospital ID', getValue: r => r.hospital_id },
        { label: 'Hospital Name', getValue: r => r.Hospital?.name || 'Unknown' },
        { label: 'Plan', getValue: r => r.Subscription?.plan?.toUpperCase() || 'N/A' },
        { label: 'Amount (INR)', getValue: r => Number(r.amount).toFixed(2) },
        { label: 'Settlement Method', getValue: r => r.method?.toUpperCase() || 'OTHER' },
        { label: 'Reference / UTR / Cheque No', getValue: r => r.reference || 'N/A' },
        { label: 'Payment Date', getValue: r => r.payment_date ? new Date(r.payment_date).toLocaleDateString('en-IN') : 'N/A' },
        { label: 'Recorded On', getValue: r => new Date(r.createdAt).toLocaleString('en-IN') },
        { label: 'Notes', getValue: r => r.notes || '' },
      ];

      rows = payments;
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 3. SUBSCRIPTIONS & RENEWALS SCHEDULE
    // ───────────────────────────────────────────────────────────────────────────
    else if (type === 'subscriptions') {
      const where = {};
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      if (startDate || endDate) where.ends_at = dateFilter;

      const subs = await Subscription.findAll({
        where,
        include: [{ model: Hospital, attributes: ['id', 'name', 'address', 'phone', 'is_blocked'] }],
        order: [['ends_at', 'ASC']],
      });

      headers = [
        { label: 'Subscription ID', getValue: r => r.id },
        { label: 'Hospital ID', getValue: r => r.hospital_id },
        { label: 'Hospital Name', getValue: r => r.Hospital?.name || 'Unknown' },
        { label: 'Plan', getValue: r => r.plan?.toUpperCase() || 'STARTER' },
        {
          label: 'Status',
          getValue: r => {
            if (!r.is_active || (r.ends_at && r.ends_at < today)) return 'EXPIRED';
            return 'ACTIVE';
          },
        },
        { label: 'Start Date', getValue: r => r.starts_at ? new Date(r.starts_at).toLocaleDateString('en-IN') : 'N/A' },
        { label: 'Expiry Date', getValue: r => r.ends_at ? new Date(r.ends_at).toLocaleDateString('en-IN') : 'N/A' },
        {
          label: 'Days Remaining',
          getValue: r => {
            if (!r.ends_at) return 'N/A';
            const diff = Math.ceil((new Date(r.ends_at).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
            return diff > 0 ? diff : 0;
          },
        },
        {
          label: 'Renewal Urgency',
          getValue: r => {
            if (!r.ends_at) return 'NORMAL';
            const diff = Math.ceil((new Date(r.ends_at).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
            if (diff <= 0 || !r.is_active) return 'EXPIRED';
            if (diff <= 7) return 'CRITICAL (≤7d)';
            if (diff <= 15) return 'HIGH (≤15d)';
            if (diff <= 30) return 'MEDIUM (≤30d)';
            return 'HEALTHY';
          },
        },
        { label: 'Hospital Operational Status', getValue: r => r.Hospital?.is_blocked ? 'SUSPENDED' : 'ACTIVE' },
      ];

      rows = subs;
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 4. CROSS-TENANT PATIENTS SUMMARY
    // ───────────────────────────────────────────────────────────────────────────
    else if (type === 'patients_summary') {
      const where = {};
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      if (startDate || endDate) where.createdAt = dateFilter;

      const patients = await Patient.findAll({
        where,
        include: [{ model: Hospital, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
      });

      headers = [
        { label: 'Patient ID', getValue: r => r.id },
        { label: 'Hospital ID', getValue: r => r.hospital_id },
        { label: 'Hospital Name', getValue: r => r.Hospital?.name || 'Unknown' },
        { label: 'Patient Name', getValue: r => r.name },
        { label: 'UHID / Reg No', getValue: r => r.uhid || 'N/A' },
        { label: 'Phone', getValue: r => r.phone || 'N/A' },
        { label: 'Expected Due Date (EDD)', getValue: r => r.edd ? new Date(r.edd).toLocaleDateString('en-IN') : 'N/A' },
        { label: 'High Risk Flag', getValue: r => r.is_high_risk ? 'YES - HIGH RISK' : 'NO' },
        { label: 'Registration Date', getValue: r => new Date(r.createdAt).toLocaleDateString('en-IN') },
      ];

      rows = patients;
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 5. AUDIT & ACTIVITY LOGS
    // ───────────────────────────────────────────────────────────────────────────
    else if (type === 'audit_logs') {
      const where = {};
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      if (startDate || endDate) where.createdAt = dateFilter;

      const notifs = await AppNotification.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: 1000,
      });

      // Map hospital names
      const hospitals = await Hospital.findAll({ attributes: ['id', 'name'] });
      const hMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]));

      headers = [
        { label: 'Event ID', getValue: r => r.id },
        { label: 'Timestamp', getValue: r => new Date(r.createdAt).toLocaleString('en-IN') },
        { label: 'Event Category', getValue: r => r.event_type?.toUpperCase() || 'EVENT' },
        { label: 'Hospital ID', getValue: r => r.hospital_id },
        { label: 'Hospital Name', getValue: r => hMap[r.hospital_id] || `Hospital #${r.hospital_id}` },
        { label: 'Actor Name', getValue: r => r.actor_name || 'System' },
        { label: 'Event Title', getValue: r => r.title || '' },
        { label: 'Event Details', getValue: r => r.body || '' },
      ];

      rows = notifs;
    } else {
      return NextResponse.json({ error: `Unknown report export type: ${type}` }, { status: 400 });
    }

    // If format is JSON, return structured data
    if (format === 'json') {
      const formattedData = rows.map(r => {
        const obj = {};
        for (const h of headers) {
          obj[h.label] = h.getValue(r);
        }
        return obj;
      });

      return NextResponse.json({
        reportType: type,
        generatedAt: new Date().toISOString(),
        totalRecords: rows.length,
        data: formattedData,
      });
    }

    // Otherwise, generate CSV attachment
    const csvContent = buildCsv(headers, rows);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating report export:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
