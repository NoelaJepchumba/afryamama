import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { fetchMotherProfile, type MobileMotherProfile } from '../lib/firestoreData';

interface ProfileScreenProps {
  email: string;
  onBack: () => void;
}
// getting the profile
export default function ProfileScreen({ email, onBack }: ProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MobileMotherProfile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        if (!email) {
          setProfile(null);
          return;
        }

        const row = await fetchMotherProfile(email.toLowerCase());
        setProfile(row);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [email]);

  const profileRows = [
    { label: 'Full Name', value: profile?.fullName || 'Not set' },
    { label: 'Email', value: profile?.email || email || 'Not set' },
    { label: 'Phone', value: profile?.phone || 'Not set' },
    { label: 'Mother Code', value: profile?.motherCode || 'Not set' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>ACCOUNT DETAILS</Text>
          <Text style={styles.heroTitle}>Mother Profile</Text>
          <Text style={styles.heroText}>Keep your contact details current so clinic updates and reminders reach you.</Text>
        </View>

        {loading ? <Text style={styles.emptyText}>Loading profile...</Text> : null}

        {!loading && !profile ? (
          <Text style={styles.emptyText}>No mother profile document found for this account.</Text>
        ) : null}

        {!loading ? (
          <View style={styles.profileCard}>
            {profileRows.map((row) => (
              <View style={styles.profileRow} key={row.label}>
                <Text style={styles.profileLabel}>{row.label}</Text>
                <Text style={styles.profileValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef3f9',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d8e2ef',
    backgroundColor: '#ffffff',
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    padding: 24,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c7d7ef',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },
  heroTag: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8e2ef',
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  profileLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
  profileValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
});
