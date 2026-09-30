'use client';
import { useEffect, useState } from 'react';
import { HeartPulse, Calendar, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import { Link } from 'next/navigation';

const STATUS_BADGE = {
  pending:  'badge-pending',
  notified: 'badge-notified',
  visited:  'badge-visited',
  skipped:  'badge-skipped',
  missed:   'badge-missed',
};

function fmt(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

export default function Stages() {
  const [stages, setStages]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('pending');

  async function load() {
    setLoading(true);
    try {
      // Fetch all patients then their stages — or use a combined approach
      const pRes = await api.get('/patients?limit=100');
      const allPatients = pRes.data.patients;

      const allStages = [];
      await Promise.all(
        allPatients.map(async (p) => {
          try {
            const sRes = await api.get(`/patients/${p.id}/stages`);
            sRes.data.forEach(s => allStages.push({ ...s, patient: p }));
          } catch { /* ignore */ }
        })
      );

      // Sort by scheduled date
      allStages.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
      setStages(allStages);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = filter ? stages.filter(s => s.status === filter) : stages;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Care Stages</div>
          <div className="page-subtitle">{filtered.length} stages shown</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.375rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
        {[
          { val: 'pending',  label: 'Pending' },
          { val: 'notified', label: 'Notified' },
          { val: 'visited',  label: 'Visited' },
          { val: 'missed',   label: 'Missed' },
          { val: '',         label: 'All' },
        ].map(({ val, label }) => {
          const count = val ? stages.filter(s => s.status === val).length : stages.length;
          const active = filter === val;
          return (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{
                padding: '0.5rem 0.875rem',
                fontSize: '0.8125rem', fontWeight: active ? 600 : 400,
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--color-primary)' : 'var(--color-text-faint)',
                borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'all 150ms',
              }}
            >
              {label}
              <span style={{
                marginLeft: '0.375rem',
                fontSize: '0.625rem', fontWeight: 600,
                padding: '0.1rem 0.375rem',
                background: active ? 'var(--color-primary-bg)' : 'var(--color-lightColor)',
                color: active ? 'var(--color-primary)' : 'var(--color-text-faint)',
                borderRadius: 'var(--radius-full)',
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><HeartPulse size={32} /></div>
            <div className="empty-state-text">No stages in this category</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Stage</th>
                  <th>Scheduled</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ fontWeight: 500, fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                        {s.patient?.name || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{s.template?.stage_name || '—'}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{fmt(s.scheduled_date)}</td>
                    <td>
                      <span className={`badge ${s.template?.type === 'pregnancy' ? 'badge-pregnant' : 'badge-immunization'}`}>
                        {s.template?.type || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[s.status] || 'badge-pending'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/patients/${s.patient?.id}`}
                        className="btn-ghost"
                        title="View Patient"
                      >
                        <Calendar size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
