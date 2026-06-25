import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import {
  fetchAppointments,
  fetchChildrenProfiles,
  fetchImmunizationData,
  fetchMotherProfileDetails,
  fetchNotifications,
  fetchRecords,
  type MobileAppointment,
  type MobileMotherProfileDetails,
  type MobileRecord,
  type MobileVaccine,
} from '../lib/firestoreData';

interface DashboardProps {
  userEmail: string;
  userName: string;
  pregnancyWeek: number | null;
  nextAppointmentText: string | null;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
}

export default function MotherDashboardScreen({
  userEmail,
  userName,
  pregnancyWeek,
  nextAppointmentText,
  onNavigate,
  onLogout,
}: DashboardProps) {
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [profileDetails, setProfileDetails] = useState<MobileMotherProfileDetails | null>(null);
  const [appointments, setAppointments] = useState<MobileAppointment[]>([]);
  const [vaccines, setVaccines] = useState<MobileVaccine[]>([]);
  const [records, setRecords] = useState<MobileRecord[]>([]);
  const [childCount, setChildCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    async function loadInsights() {
      try {
        if (!userEmail) return;

        const [details, appts, immunization, recs, children, notifications] = await Promise.all([
          fetchMotherProfileDetails(userEmail.toLowerCase()),
          fetchAppointments(userEmail.toLowerCase()),
          fetchImmunizationData(userEmail.toLowerCase()),
          fetchRecords(userEmail.toLowerCase()),
          fetchChildrenProfiles(userEmail.toLowerCase()),
          fetchNotifications(userEmail.toLowerCase()),
        ]);

        setProfileDetails(details);
        setAppointments(appts);
        setVaccines(immunization.vaccines);
        setRecords(recs);
        setChildCount(children.length || details?.childrenCount || 0);
        setUnreadNotifications(notifications.filter((item) => !item.read).length);
      } finally {
        setLoadingInsights(false);
      }
    }

    loadInsights();
  }, [userEmail]);

  const profilePregnancyWeek = useMemo(() => {
    const parsed = Number.parseInt(profileDetails?.pregnancyWeek || '', 10);
    if (Number.isNaN(parsed)) return null;
    return parsed;
  }, [profileDetails?.pregnancyWeek]);

  const activePregnancyWeek = pregnancyWeek ?? profilePregnancyWeek;
  const prenatalProgressPercent = activePregnancyWeek
    ? Math.min(Math.max((activePregnancyWeek / 40) * 100, 0), 100)
    : 0;
  const reachedDueDate = prenatalProgressPercent >= 100;
  const recordStagePostnatal = profileDetails?.stage === 'POSTNATAL';
  const isPostnatalView = recordStagePostnatal || reachedDueDate;

  const babyAgeMonthsNumber = useMemo(() => {
    const parsed = Number.parseInt(profileDetails?.babyAgeMonths || '', 10);
    if (Number.isNaN(parsed)) return null;
    return parsed;
  }, [profileDetails?.babyAgeMonths]);

  const postnatalProgressPercent = babyAgeMonthsNumber
    ? Math.min(Math.max((babyAgeMonthsNumber / 24) * 100, 0), 100)
    : 0;

  const progressPercent = isPostnatalView ? postnatalProgressPercent : prenatalProgressPercent;
  const progressWidth = `${progressPercent}%` as `${number}%`;
  const stageLabel = isPostnatalView ? 'Postnatal' : 'Prenatal';
  const babyAgeMonths = profileDetails?.babyAgeMonths || 'Not set';
  const interfaceTag = isPostnatalView ? 'POSTNATAL CARE STATUS' : 'PRENATAL CARE STATUS';
  const interfaceHeader = isPostnatalView
    ? `${babyAgeMonths} months postpartum`
    : activePregnancyWeek
      ? `Week ${activePregnancyWeek}`
      : 'Pregnancy tracking pending';
  const interfaceSub = isPostnatalView
    ? 'Track baby growth, vaccines and mother recovery follow-ups.'
    : 'Track your pregnancy week and upcoming ANC checkups.';
  const interfaceStartLabel = isPostnatalView ? 'Birth' : 'Conception';
  const interfaceEndLabel = isPostnatalView ? '24 months' : 'Due Date';
  const phaseSpotlightTitle = isPostnatalView ? 'Postnatal Focus' : 'Prenatal Focus';
  const phaseSpotlightItems = isPostnatalView
    ? [
        'Track baby growth points weekly',
        'Keep vaccine calendar up to date',
        'Monitor mother recovery signs',
      ]
    : [
        'Never miss ANC appointments',
        'Log blood pressure and warning signs',
        'Follow trimester wellness guidance',
      ];
  const autoTransitionNote = reachedDueDate && !recordStagePostnatal;

  const nearestVisitLabel = useMemo(() => {
    if (nextAppointmentText) return nextAppointmentText;
    const today = new Date();
    const upcoming = appointments
      .map((item) => ({ item, date: new Date(item.date) }))
      .filter(({ item, date }) => !Number.isNaN(date.getTime()) && item.status !== 'COMPLETED' && date >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return upcoming[0]?.item.date || 'No upcoming visit';
  }, [appointments, nextAppointmentText]);

  const profileCompletion = useMemo(() => {
    const checks = [
      Boolean(profileDetails?.fullName),
      Boolean(profileDetails?.phone),
      Boolean(profileDetails?.motherCode),
      Boolean(profileDetails?.county),
      Boolean(profileDetails?.facility),
      Boolean(profileDetails?.emergencyContactName),
      Boolean(profileDetails?.emergencyContactPhone),
      profileDetails?.stage === 'POSTNATAL' ? Boolean(profileDetails?.babyAgeMonths) : Boolean(profileDetails?.pregnancyWeek),
    ];

    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [profileDetails]);

  const missingItems = useMemo(() => {
    const items: string[] = [];
    if (!profileDetails?.county) items.push('County');
    if (!profileDetails?.facility) items.push('Facility');
    if (!profileDetails?.emergencyContactName) items.push('Emergency contact name');
    if (!profileDetails?.emergencyContactPhone) items.push('Emergency contact phone');
    if (profileDetails?.stage === 'POSTNATAL' && !profileDetails?.babyAgeMonths) items.push('Baby age');
    if (profileDetails?.stage !== 'POSTNATAL' && !profileDetails?.pregnancyWeek) items.push('Pregnancy week');
    return items;
  }, [profileDetails]);

  const missedCount = useMemo(() => {
    const now = new Date();
    return appointments.filter((item) => {
      const status = item.status.toUpperCase();
      if (status === 'MISSED') return true;
      const date = new Date(item.date);
      return !Number.isNaN(date.getTime()) && date < now && status !== 'COMPLETED';
    }).length;
  }, [appointments]);

  const dueSoonVaccines = useMemo(() => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return vaccines.filter((item) => {
      if (item.status === 'COMPLETED') return false;
      const scheduled = new Date(item.scheduled);
      if (Number.isNaN(scheduled.getTime())) return false;
      return scheduled >= now && scheduled <= deadline;
    }).length;
  }, [vaccines]);

  const bpRisk = useMemo(() => {
    const highReadings = records.filter((item) => {
      const match = item.bp.match(/(\d+)\D+(\d+)/);
      if (!match) return false;
      const systolic = Number.parseInt(match[1], 10);
      const diastolic = Number.parseInt(match[2], 10);
      return systolic >= 140 || diastolic >= 90;
    }).length;

    if (highReadings >= 2) {
      return 'High BP pattern detected in multiple checkups. Please contact your clinic.';
    }

    if (highReadings === 1) {
      return 'One high BP reading found. Keep monitoring and attend your next visit.';
    }

    return 'No blood pressure risk pattern detected from recent records.';
  }, [records]);

  const menuItems = isPostnatalView
    ? [
        {
          screen: 'IMMUNIZATION',
          color: '#10b981',
          icon: '💉',
          title: 'Immunizations',
          desc: 'Child vaccine schedule',
        },
        {
          screen: 'GROWTH',
          color: '#34d399',
          icon: '📈',
          title: 'Growth Monitoring',
          desc: 'Child growth charts',
        },
        {
          screen: 'APPOINTMENTS',
          color: '#8b5cf6',
          icon: '📅',
          title: 'Appointments',
          desc: 'Postnatal and infant visits',
        },
        {
          screen: 'SCHEDULE',
          color: '#a78bfa',
          icon: '🗓️',
          title: 'Schedule',
          desc: 'Clinic visit timeline',
        },
        {
          screen: 'TIMELINE',
          color: '#0ea5e9',
          icon: '🧭',
          title: 'Timeline',
          desc: 'All care events in one feed',
        },
        {
          screen: 'NOTIFICATIONS',
          color: '#f59e0b',
          icon: '🔔',
          title: 'Notifications',
          desc: 'Reminders and alerts',
        },
        {
          screen: 'WELLNESS',
          color: '#f97316',
          icon: '📘',
          title: 'What You Need To Know',
          desc: 'Recovery and newborn guidance',
        },
        {
          screen: 'PROFILE',
          color: '#38bdf8',
          icon: '👩',
          title: 'Profile',
          desc: 'Mother account details',
        },
      ]
    : [
        {
          screen: 'APPOINTMENTS',
          color: '#8b5cf6',
          icon: '📅',
          title: 'Appointments',
          desc: 'Booked and pending ANC visits',
        },
        {
          screen: 'RECORDS',
          color: '#ec4899',
          icon: '📝',
          title: 'Health Records',
          desc: 'Prenatal checkup logs',
        },
        {
          screen: 'MILESTONES',
          color: '#22d3ee',
          icon: '🎯',
          title: 'Milestones',
          desc: 'Pregnancy progress goals',
        },
        {
          screen: 'SCHEDULE',
          color: '#a78bfa',
          icon: '🗓️',
          title: 'Schedule',
          desc: 'Clinic visit timeline',
        },
        {
          screen: 'TIMELINE',
          color: '#0ea5e9',
          icon: '🧭',
          title: 'Timeline',
          desc: 'All care events in one feed',
        },
        {
          screen: 'NOTIFICATIONS',
          color: '#f59e0b',
          icon: '🔔',
          title: 'Notifications',
          desc: 'Reminders and alerts',
        },
        {
          screen: 'WELLNESS',
          color: '#f97316',
          icon: '📘',
          title: 'What You Need To Know',
          desc: 'Pregnancy care tips and guidance',
        },
        {
          screen: 'PROFILE',
          color: '#38bdf8',
          icon: '👩',
          title: 'Profile',
          desc: 'Mother account details',
        },
      ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.nameText}>{userName} 👋</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusStrip}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillLabel}>Next Visit</Text>
          <Text style={styles.statusPillValue}>{nearestVisitLabel}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillLabel}>Stage</Text>
          <Text style={styles.statusPillValue}>{stageLabel}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillLabel}>Children</Text>
          <Text style={styles.statusPillValue}>{childCount}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillLabel}>Alerts</Text>
          <Text style={styles.statusPillValue}>{unreadNotifications} unread</Text>
        </View>
      </View>

      {/* Pregnancy Status Card */}
      <View style={styles.statusCard}>
        <Text style={styles.cardTag}>{interfaceTag}</Text>
        <Text style={styles.cardHeader}>{interfaceHeader}</Text>
        <Text style={styles.cardSub}>{interfaceSub}</Text>

        {autoTransitionNote ? (
          <View style={styles.transitionCard}>
            <Text style={styles.transitionTitle}>You reached your due-date milestone.</Text>
            <Text style={styles.transitionBody}>
              Your dashboard has shifted to postnatal mode so you can focus on recovery and infant care.
            </Text>
            <TouchableOpacity style={styles.transitionButton} onPress={() => onNavigate('PROFILE')}>
              <Text style={styles.transitionButtonText}>Complete Postnatal Profile</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        
        {/* Simple Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: progressWidth }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabelText}>{interfaceStartLabel}</Text>
          <Text style={styles.progressLabelText}>{Math.round(progressPercent)}%</Text>
          <Text style={styles.progressLabelText}>{interfaceEndLabel}</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>Profile Completion</Text>
        <Text style={styles.infoCardBody}>{profileCompletion}% completed</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${profileCompletion}%` as `${number}%` }]} />
        </View>
        <Text style={styles.infoCardHint}>
          {missingItems.length > 0 ? `Missing: ${missingItems.join(', ')}` : 'Profile details are complete.'}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>Smart Reminders</Text>
        <Text style={styles.infoCardBody}>Missed follow-ups: {missedCount}</Text>
        {isPostnatalView ? (
          <Text style={styles.infoCardBody}>Vaccines due in 7 days: {dueSoonVaccines}</Text>
        ) : (
          <Text style={styles.infoCardBody}>
            Weeks to due date: {activePregnancyWeek ? Math.max(40 - activePregnancyWeek, 0) : 'Unknown'}
          </Text>
        )}
        <Text style={styles.infoCardBody}>Unread notifications: {unreadNotifications}</Text>
        <Text style={styles.infoCardHint}>Tap Timeline for full event history.</Text>
      </View>

      <View style={styles.phaseSpotlightCard}>
        <Text style={styles.phaseSpotlightTag}>PHASE SPOTLIGHT</Text>
        <Text style={styles.phaseSpotlightTitle}>{phaseSpotlightTitle}</Text>
        {phaseSpotlightItems.map((item) => (
          <Text key={item} style={styles.phaseSpotlightItem}>• {item}</Text>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>Risk Flags</Text>
        <Text style={styles.infoCardBody}>{bpRisk}</Text>
        {loadingInsights ? <Text style={styles.infoCardHint}>Analyzing latest records...</Text> : null}
      </View>

      {/* Quick Action Grid */}
      <Text style={styles.sectionTitle}>Mother Services</Text>
      <View style={styles.grid}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.title}
            style={styles.gridCard}
            onPress={() => onNavigate(item.screen)}
          >
            {item.screen === 'NOTIFICATIONS' && unreadNotifications > 0 ? (
              <View style={styles.pingBadge}>
                <Text style={styles.pingBadgeText}>PING</Text>
              </View>
            ) : null}
            <View style={[styles.gridIconBg, { backgroundColor: item.color }]}>
              <Text style={styles.gridIcon}>{item.icon}</Text>
            </View>
            <Text style={styles.gridTitle}>{item.title}</Text>
            <Text style={styles.gridDesc}>{item.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Next Appointment Alert */}
      <View style={styles.alertBox}>
        <View style={styles.alertHeader}>
          <Text style={styles.alertHeaderIcon}>🔔</Text>
          <Text style={styles.alertHeaderTitle}>Next Care Reminder</Text>
        </View>
        <Text style={styles.alertText}>
          {nextAppointmentText
            ? `You have a ${isPostnatalView ? 'postnatal' : 'prenatal'} checkup scheduled on ${nextAppointmentText}.`
            : `No upcoming ${isPostnatalView ? 'postnatal' : 'prenatal'} appointment is linked yet in your profile.`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef3f9',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  welcomeText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
  nameText: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
    backgroundColor: '#ffffff',
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8e2ef',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
  },
  statusStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  statusPill: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8e2ef',
    borderRadius: 12,
    padding: 10,
  },
  statusPillLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusPillValue: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  cardTag: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardHeader: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSub: {
    color: '#475569',
    fontSize: 13,
    marginBottom: 10,
  },
  transitionCard: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
    padding: 12,
  },
  transitionTitle: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  transitionBody: {
    color: '#166534',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  transitionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  transitionButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  codeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  codeBadgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 5,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8e2ef',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  infoCardTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoCardBody: {
    color: '#334155',
    fontSize: 13,
    marginBottom: 4,
  },
  infoCardHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  phaseSpotlightCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  phaseSpotlightTag: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  phaseSpotlightTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  phaseSpotlightItem: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  progressLabelText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  gridCard: {
    position: 'relative',
    width: '48%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8e2ef',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  gridIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  gridIcon: {
    fontSize: 18,
  },
  gridTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  gridDesc: {
    color: '#475569',
    fontSize: 12,
  },
  pingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#ef4444',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 2,
  },
  pingBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  alertBox: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  alertHeaderIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  alertHeaderTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  alertText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
});
