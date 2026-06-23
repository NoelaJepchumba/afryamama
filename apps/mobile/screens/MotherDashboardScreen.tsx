import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Dimensions } from 'react-native';

interface DashboardProps {
  userName: string;
  pregnancyWeek: number | null;
  nextAppointmentText: string | null;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
}

export default function MotherDashboardScreen({
  userName,
  pregnancyWeek,
  nextAppointmentText,
  onNavigate,
  onLogout,
}: DashboardProps) {
  const weekLabel = pregnancyWeek ? `Week ${pregnancyWeek}` : 'Pregnancy tracking pending';
  const progressPercent = pregnancyWeek ? Math.min(Math.max((pregnancyWeek / 40) * 100, 0), 100) : 0;
  const progressWidth = `${progressPercent}%` as `${number}%`;

  const menuItems = [
    {
      screen: 'IMMUNIZATION',
      color: '#10b981',
      icon: '💉',
      title: 'Immunizations',
      desc: 'Child vaccine schedule',
    },
    {
      screen: 'RECORDS',
      color: '#ec4899',
      icon: '📝',
      title: 'Health Records',
      desc: 'Prenatal checkup logs',
    },
    {
      screen: 'PROFILE',
      color: '#38bdf8',
      icon: '👩',
      title: 'Profile',
      desc: 'Mother account details',
    },
    {
      screen: 'SCHEDULE',
      color: '#a78bfa',
      icon: '🗓️',
      title: 'Schedule',
      desc: 'Clinic visit timeline',
    },
    {
      screen: 'MILESTONES',
      color: '#22d3ee',
      icon: '🎯',
      title: 'Milestones',
      desc: 'Pregnancy progress goals',
    },
    {
      screen: 'APPOINTMENTS',
      color: '#8b5cf6',
      icon: '📅',
      title: 'Appointments',
      desc: 'Booked and pending visits',
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
      desc: 'Care tips and guidance',
    },
    {
      screen: 'GROWTH',
      color: '#34d399',
      icon: '📈',
      title: 'Growth Monitoring',
      desc: 'Child growth charts',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Jambo,</Text>
          <Text style={styles.nameText}>{userName} 👋</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Pregnancy Status Card */}
      <View style={styles.statusCard}>
        <Text style={styles.cardTag}>PREGNANCY STATUS</Text>
        <Text style={styles.cardHeader}>{weekLabel}</Text>
        <Text style={styles.cardSub}>Synced from your Firebase maternal profile</Text>
        
        {/* Simple Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: progressWidth }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabelText}>Conception</Text>
          <Text style={styles.progressLabelText}>52%</Text>
          <Text style={styles.progressLabelText}>Due Date</Text>
        </View>
      </View>

      {/* Quick Action Grid */}
      <Text style={styles.sectionTitle}>Maternal Care Menu</Text>
      <View style={styles.grid}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.title}
            style={styles.gridCard}
            onPress={() => onNavigate(item.screen)}
          >
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
          <Text style={styles.alertHeaderTitle}>Upcoming Prenatal Visit</Text>
        </View>
        <Text style={styles.alertText}>
          {nextAppointmentText
            ? `You have a prenatal checkup scheduled on ${nextAppointmentText}.`
            : 'No upcoming prenatal appointment is linked yet in your profile.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
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
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '500',
  },
  nameText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: '#243049',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
  },
  cardTag: {
    color: '#ec4899',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardHeader: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSub: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 16,
  },
  progressTrack: {
    height: 10,
    backgroundColor: '#182235',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ec4899',
    borderRadius: 5,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabelText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#ffffff',
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
    width: '48%',
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: '#243049',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  gridDesc: {
    color: '#64748b',
    fontSize: 12,
  },
  alertBox: {
    backgroundColor: '#182235',
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
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
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  alertText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
});
