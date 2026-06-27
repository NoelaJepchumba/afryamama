import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  fetchAppointments,
  fetchMotherProfileDetails,
  requestEmergencyAppointment,
  type MobileAppointment,
} from '../lib/firestoreData';

type MotherStage = 'PRENATAL' | 'POSTNATAL';

interface AppointmentsProps {
  email: string;
  onBack: () => void;
}

export default function AppointmentsScreen({ email, onBack }: AppointmentsProps) {
  const [appointments, setAppointments] = useState<MobileAppointment[]>([]);
  const [stage, setStage] = useState<MotherStage>('PRENATAL');
  const [loading, setLoading] = useState(true);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [submittingEmergency, setSubmittingEmergency] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const isPostnatal = stage === 'POSTNATAL';

  function cleanReason(value: string): string {
    return value.replace(/\s*\(MCH booklet\)\s*/gi, '').trim();
  }

  function inferStage(item: MobileAppointment): MotherStage | 'ALL' {
    if (item.stage === 'PRENATAL' || item.stage === 'POSTNATAL' || item.stage === 'ALL') return item.stage;

    const reason = `${item.reason} ${item.doctor}`.toLowerCase();
    if (reason.includes('postnatal') || reason.includes('pnc')) return 'POSTNATAL';
    if (reason.includes('prenatal') || reason.includes('anc') || reason.includes('pregnan')) return 'PRENATAL';
    return 'ALL';
  }

  function parseDateSafe(value: string): Date | null {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  function formatDateValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatTimeValue(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function formatMonthLabel(value: Date): string {
    return value.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  function buildCalendarDays(monthDate: Date): Array<Date | null> {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prefix = firstDay.getDay();
    const cells: Array<Date | null> = [];

    for (let index = 0; index < prefix; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }

    return cells;
  }

  function toTimeOptions(): string[] {
    const rows: string[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 30) {
        const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        rows.push(label);
      }
    }
    return rows;
  }

  const calendarDays = buildCalendarDays(calendarMonth);
  const timeOptions = toTimeOptions();
  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const stageAppointments = appointments.filter((item) => {
    const inferred = inferStage(item);
    return inferred === 'ALL' || inferred === stage;
  });

  const upcomingAppointments = stageAppointments
    .filter((item) => {
      const status = item.status.toUpperCase();
      if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'REJECTED' || status === 'MISSED') return false;

      const date = parseDateSafe(item.date);
      if (!date) return true;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    })
    .sort((a, b) => {
      const aDate = parseDateSafe(a.date)?.getTime() || 0;
      const bDate = parseDateSafe(b.date)?.getTime() || 0;
      return aDate - bDate;
    });

  const historyAppointments = stageAppointments
    .filter((item) => !upcomingAppointments.some((upcoming) => upcoming.id === item.id))
    .sort((a, b) => {
      const aDate = parseDateSafe(a.date)?.getTime() || 0;
      const bDate = parseDateSafe(b.date)?.getTime() || 0;
      return bDate - aDate;
    });

  const completedCount = stageAppointments.filter((item) => item.status.toUpperCase() === 'COMPLETED').length;
  const upcomingCount = upcomingAppointments.length;
  const missedCount = stageAppointments.filter((item) => item.status.toUpperCase() === 'MISSED').length;

  useEffect(() => {
    async function loadAppointments() {
      try {
        if (!email) {
          setAppointments([]);
          return;
        }

        const normalizedEmail = email.toLowerCase();
        const [rows, profile] = await Promise.all([
          fetchAppointments(normalizedEmail),
          fetchMotherProfileDetails(normalizedEmail),
        ]);

        setStage(profile?.stage?.toUpperCase() === 'POSTNATAL' ? 'POSTNATAL' : 'PRENATAL');
        setAppointments(rows);
      } finally {
        setLoading(false);
      }
    }

    loadAppointments();
  }, [email]);

  async function refreshAppointments() {
    if (!email) {
      setAppointments([]);
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const rows = await fetchAppointments(normalizedEmail);
    setAppointments(rows);
  }

  async function submitEmergencyRequest() {
    const date = preferredDate.trim();
    const time = preferredTime.trim();
    const reason = emergencyReason.trim();

    if (!date) {
      Alert.alert('Date required', 'Enter a preferred date in YYYY-MM-DD format.');
      return;
    }

    if (!time) {
      Alert.alert('Time required', 'Enter a preferred time in HH:mm format.');
      return;
    }

    if (!reason) {
      Alert.alert('Reason required', 'Tell the clinic what the emergency is about.');
      return;
    }

    try {
      setSubmittingEmergency(true);
      await requestEmergencyAppointment(email.toLowerCase(), {
        preferredDate: date,
        preferredTime: time,
        reason,
      });

      setPreferredDate('');
      setPreferredTime('');
      setEmergencyReason('');
      await refreshAppointments();
      Alert.alert('Request sent', 'Your emergency appointment request was submitted.');
    } catch {
      Alert.alert('Could not send request', 'Please try again in a moment.');
    } finally {
      setSubmittingEmergency(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.hero, { backgroundColor: isPostnatal ? '#0c4a6e' : '#3a0440' }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heroTitle}>{isPostnatal ? '🌱 Postnatal Appointments' : '🤰 Prenatal Appointments'}</Text>
        <Text style={[styles.heroSub, { color: isPostnatal ? '#7dd3fc' : '#f5b8e8' }]}>
          {isPostnatal
            ? 'Your upcoming postnatal visits and baby-care follow-ups.'
            : 'Your upcoming antenatal care visits for this pregnancy stage.'}
        </Text>

        <View style={styles.heroProgress}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${stageAppointments.length ? Math.round((completedCount / stageAppointments.length) * 100) : 0}%` as `${number}%`,
                  backgroundColor: isPostnatal ? '#34d399' : '#f5b8e8',
                },
              ]}
            />
          </View>
          <Text style={styles.progressPct}>{stageAppointments.length ? Math.round((completedCount / stageAppointments.length) * 100) : 0}% done</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!loading ? (
          <View style={styles.metricRow}>
            <View style={[styles.metricPill, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
              <Text style={styles.metricLabel}>Upcoming</Text>
              <Text style={[styles.metricValue, { color: '#15803d' }]}>{upcomingCount}</Text>
            </View>
            <View style={[styles.metricPill, { backgroundColor: '#fdf5f9', borderColor: '#EBD6ED' }]}>
              <Text style={styles.metricLabel}>Completed</Text>
              <Text style={[styles.metricValue, { color: '#7e22ce' }]}>{completedCount}</Text>
            </View>
            <View style={[styles.metricPill, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Text style={styles.metricLabel}>Missed</Text>
              <Text style={[styles.metricValue, { color: '#b45309' }]}>{missedCount}</Text>
            </View>
        </View>
        ) : null}

        <View style={styles.emergencyCard}>
          <Text style={styles.emergencyTitle}>Emergency Appointment Request</Text>
          <Text style={styles.emergencySubtitle}>Need urgent care? Send a request and the clinic team will contact you.</Text>

          <TextInput
            style={styles.emergencyInput}
            value={preferredDate}
            onChangeText={setPreferredDate}
            placeholder="Preferred date (YYYY-MM-DD)"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            editable={false}
          />

          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowCalendarModal(true)}>
            <Text style={styles.pickerBtnText}>Open Calendar</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.emergencyInput}
            value={preferredTime}
            onChangeText={setPreferredTime}
            placeholder="Preferred time (HH:mm)"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            editable={false}
          />

          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimeModal(true)}>
            <Text style={styles.pickerBtnText}>Pick Time</Text>
          </TouchableOpacity>

          <TextInput
            style={[styles.emergencyInput, styles.emergencyReasonInput]}
            value={emergencyReason}
            onChangeText={setEmergencyReason}
            placeholder="Emergency reason"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitEmergencyBtn, submittingEmergency ? styles.submitEmergencyBtnDisabled : null]}
            onPress={submitEmergencyRequest}
            disabled={submittingEmergency}
          >
            <Text style={styles.submitEmergencyBtnText}>{submittingEmergency ? 'Sending request...' : 'Send Emergency Request'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{isPostnatal ? 'Upcoming Postnatal Consultations' : 'Upcoming Prenatal Consultations'}</Text>

        {loading ? <Text style={styles.emptyText}>Loading appointments...</Text> : null}

        {!loading && upcomingAppointments.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming appointments for your current stage yet.</Text>
        ) : null}

        {upcomingAppointments.map((appt) => (
          <View style={styles.apptCard} key={appt.id}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.apptDate}>{appt.date}</Text>
                <Text style={styles.apptTime}>{appt.time}</Text>
              </View>
              <View style={[
                styles.badge, 
                appt.status === 'COMPLETED' ? styles.badgeSuccess : styles.badgeWarning
              ]}>
                <Text style={[
                  styles.badgeText,
                  appt.status === 'COMPLETED' ? styles.badgeTextSuccess : styles.badgeTextWarning
                ]}>{appt.status}</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.reason}>📌 Reason: {cleanReason(appt.reason)}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Recent Appointment History</Text>
        {historyAppointments.length === 0 ? (
          <Text style={styles.emptyText}>No past appointments in this stage yet.</Text>
        ) : null}

        {historyAppointments.slice(0, 6).map((appt) => (
          <View style={styles.apptCard} key={`history-${appt.id}`}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.apptDate}>{appt.date}</Text>
                <Text style={styles.apptTime}>{appt.time}</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  appt.status.toUpperCase() === 'COMPLETED' ? styles.badgeSuccess : styles.badgeWarning,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    appt.status.toUpperCase() === 'COMPLETED' ? styles.badgeTextSuccess : styles.badgeTextWarning,
                  ]}
                >
                  {appt.status}
                </Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.reason}>📌 Reason: {cleanReason(appt.reason)}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.bookBtn} onPress={submitEmergencyRequest} disabled={submittingEmergency}>
          <Text style={styles.bookBtnText}>{submittingEmergency ? 'Sending request...' : 'Book Emergency Appointment'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showCalendarModal} transparent animationType="slide" onRequestClose={() => setShowCalendarModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                style={styles.monthNavBtn}
              >
                <Text style={styles.monthNavText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{formatMonthLabel(calendarMonth)}</Text>
              <TouchableOpacity
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                style={styles.monthNavBtn}
              >
                <Text style={styles.monthNavText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {weekLabels.map((label) => (
                <Text key={label} style={styles.weekLabel}>{label}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarDays.map((day, index) => {
                if (!day) {
                  return <View key={`empty-${index}`} style={styles.dayCell} />;
                }

                const dateValue = formatDateValue(day);
                const isSelected = preferredDate === dateValue;
                const isPast = day < startOfToday();

                return (
                  <TouchableOpacity
                    key={dateValue}
                    disabled={isPast}
                    style={[
                      styles.dayCell,
                      styles.dayButton,
                      isSelected ? styles.dayButtonSelected : null,
                      isPast ? styles.dayButtonDisabled : null,
                    ]}
                    onPress={() => {
                      setPreferredDate(dateValue);
                      setShowCalendarModal(false);
                    }}
                  >
                    <Text style={[styles.dayText, isSelected ? styles.dayTextSelected : null, isPast ? styles.dayTextDisabled : null]}>
                      {day.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowCalendarModal(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTimeModal} transparent animationType="slide" onRequestClose={() => setShowTimeModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Time</Text>
            <ScrollView style={styles.timeList} contentContainerStyle={styles.timeListContent}>
              {timeOptions.map((slot) => {
                const isSelected = preferredTime === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.timeOption, isSelected ? styles.timeOptionSelected : null]}
                    onPress={() => {
                      setPreferredTime(slot);
                      setShowTimeModal(false);
                    }}
                  >
                    <Text style={[styles.timeOptionText, isSelected ? styles.timeOptionTextSelected : null]}>{slot}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowTimeModal(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  hero: {
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backBtn: {
    marginBottom: 12,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  heroProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 70,
    textAlign: 'right',
    color: '#ffffff',
  },
  content: {
    padding: 18,
    paddingBottom: 50,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricPill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  emergencyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  emergencyTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emergencySubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 10,
  },
  emergencyInput: {
    borderWidth: 1,
    borderColor: '#dbe4f0',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    fontSize: 13,
    marginBottom: 8,
  },
  emergencyReasonInput: {
    minHeight: 76,
  },
  pickerBtn: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#fff6fb',
    alignItems: 'center',
  },
  pickerBtnText: {
    color: '#7e22ce',
    fontWeight: '700',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '78%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthNavBtn: {
    borderWidth: 1,
    borderColor: '#EBD6ED',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavText: {
    color: '#7e22ce',
    fontSize: 18,
    fontWeight: '700',
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekLabel: {
    width: `${100 / 7}%` as `${number}%`,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  dayCell: {
    width: `${100 / 7}%` as `${number}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButton: {
    borderRadius: 10,
  },
  dayButtonSelected: {
    backgroundColor: '#7e22ce',
  },
  dayButtonDisabled: {
    backgroundColor: '#f8fafc',
  },
  dayText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  dayTextDisabled: {
    color: '#94a3b8',
  },
  timeList: {
    maxHeight: 360,
    marginTop: 10,
  },
  timeListContent: {
    gap: 8,
  },
  timeOption: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timeOptionSelected: {
    borderColor: '#7e22ce',
    backgroundColor: '#f5eafe',
  },
  timeOptionText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  timeOptionTextSelected: {
    color: '#6b21a8',
  },
  modalCloseBtn: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EBD6ED',
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#7e22ce',
    fontWeight: '700',
    fontSize: 13,
  },
  submitEmergencyBtn: {
    marginTop: 4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitEmergencyBtnDisabled: {
    opacity: 0.6,
  },
  submitEmergencyBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 6,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  apptCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  apptDate: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
  },
  apptTime: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9999,
  },
  badgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeTextWarning: {
    color: '#f59e0b',
  },
  badgeTextSuccess: {
    color: '#10b981',
  },
  cardBody: {
    gap: 4,
  },
  reason: {
    color: '#475569',
    fontSize: 13,
  },
  bookBtn: {
    backgroundColor: '#55075c',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  bookBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
