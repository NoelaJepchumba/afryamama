import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import {
  fetchImmunizationData,
  saveHistoricalImmunizationStatus,
  type MobileChildProfile,
  type MobileVaccine,
} from '../lib/firestoreData';

interface ImmunizationProps {
  email: string;
  onBack: () => void;
}

type ScheduleStatus = 'COMPLETED' | 'MISSED' | 'OVERDUE' | 'DUE_NOW' | 'UPCOMING';

interface VaccineScheduleItem {
  id: string;
  name: string;
  ageLabel: string;
  dueWeeks: number;
  keywords: string[];
}

interface AgeBasedVaccineRow {
  id: string;
  name: string;
  ageLabel: string;
  status: ScheduleStatus;
  administered: string | null;
  canSelfReport: boolean;
}

const IMMUNIZATION_SCHEDULE: VaccineScheduleItem[] = [
  { id: 'bcg-opv0', name: 'BCG + OPV 0', ageLabel: 'At birth', dueWeeks: 0, keywords: ['bcg', 'opv 0', 'opv0'] },
  { id: '6w', name: 'Pentavalent 1 + PCV 1 + OPV 1 + Rota 1', ageLabel: '6 weeks', dueWeeks: 6, keywords: ['penta 1', 'pentavalent 1', 'pcv 1', 'opv 1', 'rota 1'] },
  { id: '10w', name: 'Pentavalent 2 + PCV 2 + OPV 2 + Rota 2', ageLabel: '10 weeks', dueWeeks: 10, keywords: ['penta 2', 'pentavalent 2', 'pcv 2', 'opv 2', 'rota 2'] },
  { id: '14w', name: 'Pentavalent 3 + PCV 3 + OPV 3 + IPV', ageLabel: '14 weeks', dueWeeks: 14, keywords: ['penta 3', 'pentavalent 3', 'pcv 3', 'opv 3', 'ipv'] },
  { id: '9m', name: 'Measles-Rubella 1 + Yellow Fever', ageLabel: '9 months', dueWeeks: 39, keywords: ['measles', 'rubella', 'mr 1', 'yellow fever'] },
  { id: '18m', name: 'Measles-Rubella 2', ageLabel: '18 months', dueWeeks: 78, keywords: ['mr 2', 'measles-rubella 2', 'measles rubella 2'] },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function parseChildBirthDate(child: MobileChildProfile | null): Date | null {
  if (!child) return null;

  const candidates = [child.childBirthIso, child.childBirth].filter(Boolean) as string[];
  for (const raw of candidates) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getAgeInWeeks(birthDate: Date | null): number | null {
  if (!birthDate) return null;

  const now = Date.now();
  const born = birthDate.getTime();
  if (born > now) return 0;

  const diffDays = Math.floor((now - born) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function formatAge(ageWeeks: number | null): string {
  if (ageWeeks === null) return 'Age unavailable';
  const months = Math.floor(ageWeeks / 4.345);
  return `${months} months (${ageWeeks} weeks)`;
}

function computeScheduleStatus(ageWeeks: number, dueWeeks: number, completed: boolean): ScheduleStatus {
  if (completed) return 'COMPLETED';

  if (ageWeeks >= dueWeeks + 4) return 'OVERDUE';
  if (ageWeeks >= dueWeeks) return 'DUE_NOW';
  return 'UPCOMING';
}

function toStatusLabel(status: ScheduleStatus): string {
  if (status === 'COMPLETED') return 'Given';
  if (status === 'MISSED') return 'Missed';
  if (status === 'OVERDUE') return 'Overdue';
  if (status === 'DUE_NOW') return 'Due now';
  return 'Upcoming';
}

export default function ImmunizationScreen({ email, onBack }: ImmunizationProps) {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<MobileChildProfile[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [vaccines, setVaccines] = useState<MobileVaccine[]>([]);
  const [savingScheduleKey, setSavingScheduleKey] = useState<string | null>(null);

  useEffect(() => {
    async function loadImmunization() {
      try {
        if (!email) {
          setVaccines([]);
          return;
        }

        const payload = await fetchImmunizationData(email.toLowerCase(), selectedChildId || undefined);
        setChildren(payload.children);
        setSelectedChildId(payload.selectedChildId);
        setVaccines(payload.vaccines);
      } finally {
        setLoading(false);
      }
    }

    loadImmunization();
  }, [email, selectedChildId]);

  const selectedChild = children.find((item) => item.id === selectedChildId) || null;
  const childBirthDate = useMemo(() => parseChildBirthDate(selectedChild), [selectedChild]);
  const childAgeWeeks = useMemo(() => getAgeInWeeks(childBirthDate), [childBirthDate]);

  const ageBasedSchedule = useMemo<AgeBasedVaccineRow[]>(() => {
    if (childAgeWeeks === null) return [];

    const normalizedRecords = vaccines.map((item) => ({
      ...item,
      normalizedName: normalizeText(item.name),
    }));

    return IMMUNIZATION_SCHEDULE.map((scheduleItem) => {
      const matchedRecord = normalizedRecords.find((record) =>
        normalizeText(record.scheduleKey || '') === normalizeText(scheduleItem.id)
      ) || normalizedRecords.find((record) =>
        scheduleItem.keywords.some((keyword) => record.normalizedName.includes(normalizeText(keyword)))
      );

      const completed = matchedRecord?.status === 'COMPLETED';
      const missed = matchedRecord?.status === 'MISSED';
      const administered = completed ? matchedRecord?.administered || null : null;
      const isPastDose = childAgeWeeks > scheduleItem.dueWeeks;

      let status: ScheduleStatus;
      if (missed) {
        status = 'MISSED';
      } else {
        status = computeScheduleStatus(childAgeWeeks, scheduleItem.dueWeeks, completed);
      }

      return {
        id: scheduleItem.id,
        name: scheduleItem.name,
        ageLabel: scheduleItem.ageLabel,
        status,
        administered,
        canSelfReport: isPastDose && status !== 'COMPLETED',
      };
    });
  }, [childAgeWeeks, vaccines]);

  async function onSelfReportDose(row: AgeBasedVaccineRow, status: 'COMPLETED' | 'MISSED') {
    if (!selectedChild || !email) return;

    try {
      setSavingScheduleKey(row.id);

      await saveHistoricalImmunizationStatus({
        email: email.toLowerCase(),
        childId: selectedChild.id,
        childCode: selectedChild.childCode,
        scheduleKey: row.id,
        vaccineName: row.name,
        ageLabel: row.ageLabel,
        status,
      });

      setVaccines((prev) => {
        const next = [...prev];
        const existingIndex = next.findIndex((item) => normalizeText(item.scheduleKey || '') === normalizeText(row.id));

        const updated: MobileVaccine = {
          id: existingIndex >= 0 ? next[existingIndex].id : `local-${row.id}`,
          name: row.name,
          scheduled: row.ageLabel,
          administered: status === 'COMPLETED' ? new Date().toLocaleDateString() : null,
          status,
          scheduleKey: row.id,
        };

        if (existingIndex >= 0) {
          next[existingIndex] = updated;
        } else {
          next.push(updated);
        }

        return next;
      });
    } finally {
      setSavingScheduleKey(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Vaccination Card</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>CHILD PROTECTION</Text>
          <Text style={styles.heroTitle}>Immunizations</Text>
          <Text style={styles.heroText}>Stay ahead of each vaccine dose and keep your baby fully protected.</Text>
        </View>

        {children.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherRow}>
            {children.map((child) => {
              const active = child.id === selectedChildId;
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.switcherChip, active ? styles.switcherChipActive : null]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={[styles.switcherChipText, active ? styles.switcherChipTextActive : null]}>{child.childName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.childHeaderCard}>
          <Text style={styles.childIcon}>👶</Text>
          <View>
            <Text style={styles.childName}>{selectedChild?.childName || 'Child Profile'}</Text>
            <Text style={styles.childBirth}>Born: {selectedChild?.childBirth || 'Birth date not set'}</Text>
            <Text style={styles.childAge}>Current age: {formatAge(childAgeWeeks)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Immunization Schedule</Text>

        {loading ? <Text style={styles.emptyText}>Loading immunization records...</Text> : null}

        {!loading && vaccines.length === 0 && ageBasedSchedule.length === 0 ? (
          <Text style={styles.emptyText}>No vaccine records found in Firestore.</Text>
        ) : null}

        {ageBasedSchedule.map((v) => (
          <View style={styles.vaccineRow} key={v.id}>
            <View style={styles.vaccineDetails}>
              <Text style={styles.vaccineName}>{v.name}</Text>
              <Text style={styles.vaccineSchedule}>Recommended age: {v.ageLabel}</Text>
              {v.administered && (
                <Text style={styles.administeredText}>Given</Text>
              )}

              {v.canSelfReport ? (
                <View style={styles.selfReportInlineRow}>
                  <TouchableOpacity
                    style={[styles.selfReportBtn, styles.selfReportGivenBtn]}
                    onPress={() => onSelfReportDose(v, 'COMPLETED')}
                    disabled={savingScheduleKey === v.id}
                  >
                    <Text style={styles.selfReportGivenText}>{savingScheduleKey === v.id ? 'Saving...' : 'Given'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selfReportBtn, styles.selfReportMissedBtn]}
                    onPress={() => onSelfReportDose(v, 'MISSED')}
                    disabled={savingScheduleKey === v.id}
                  >
                    <Text style={styles.selfReportMissedText}>{savingScheduleKey === v.id ? 'Saving...' : 'Missed'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={[
              styles.statusIndicator,
              v.status === 'COMPLETED'
                ? styles.statusSuccess
                : v.status === 'MISSED'
                  ? styles.statusNeutral
                : v.status === 'OVERDUE'
                  ? styles.statusDanger
                  : v.status === 'DUE_NOW'
                    ? styles.statusWarning
                    : styles.statusPending
            ]}>
              <Text style={[
                styles.statusText,
                v.status === 'COMPLETED'
                  ? styles.statusTextSuccess
                  : v.status === 'MISSED'
                    ? styles.statusTextNeutral
                  : v.status === 'OVERDUE'
                    ? styles.statusTextDanger
                    : v.status === 'DUE_NOW'
                      ? styles.statusTextWarning
                      : styles.statusTextPending
              ]}>
                {v.status === 'COMPLETED' ? '✓' : v.status === 'MISSED' ? '×' : v.status === 'OVERDUE' ? '!' : v.status === 'DUE_NOW' ? '•' : '○'}
              </Text>
            </View>

            <View style={styles.statusTextWrap}>
              <Text style={styles.statusLabel}>{toStatusLabel(v.status)}</Text>
            </View>
          </View>
        ))}

        {!loading && ageBasedSchedule.length === 0 ? (
          vaccines.map((v) => (
            <View style={styles.vaccineRow} key={v.id}>
              <View style={styles.vaccineDetails}>
                <Text style={styles.vaccineName}>{v.name}</Text>
                <Text style={styles.vaccineSchedule}>Recommended: {v.scheduled}</Text>
                {v.administered && (
                  <Text style={styles.administeredText}>Given</Text>
                )}
              </View>

              <View style={[
                styles.statusIndicator,
                v.status === 'COMPLETED' ? styles.statusSuccess : styles.statusPending
              ]}>
                <Text style={[
                  styles.statusText,
                  v.status === 'COMPLETED' ? styles.statusTextSuccess : styles.statusTextPending
                ]}>
                  {v.status === 'COMPLETED' ? '✓' : '○'}
                </Text>
              </View>
            </View>
          ))
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#3a0440',
  },
  backBtn: {
    marginRight: 12,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  content: {
    padding: 18,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroTag: {
    color: '#55075c',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#1a1a2e',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  childHeaderCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  switcherRow: {
    gap: 8,
    paddingBottom: 10,
  },
  switcherChip: {
    borderWidth: 1,
    borderColor: '#EBD6ED',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  switcherChipActive: {
    borderColor: '#55075c',
    backgroundColor: '#fdf5f9',
  },
  switcherChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  switcherChipTextActive: {
    color: '#55075c',
  },
  childIcon: {
    fontSize: 32,
  },
  childName: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '700',
  },
  childBirth: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  childAge: {
    color: '#55075c',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  vaccineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  vaccineDetails: {
    flex: 1,
  },
  vaccineName: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '600',
  },
  vaccineSchedule: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  administeredText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statusIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  statusNeutral: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
  },
  statusWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  statusDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusTextSuccess: {
    color: '#10b981',
  },
  statusTextPending: {
    color: '#f59e0b',
  },
  statusTextNeutral: {
    color: '#475569',
  },
  statusTextWarning: {
    color: '#d97706',
  },
  statusTextDanger: {
    color: '#dc2626',
  },
  statusTextWrap: {
    marginLeft: 10,
  },
  statusLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  selfReportInlineRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  selfReportBtn: {
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  selfReportGivenBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  selfReportMissedBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  selfReportGivenText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  selfReportMissedText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
});
