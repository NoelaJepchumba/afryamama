import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { fetchMotherProfile, type MobileMotherProfile } from '../lib/firestoreData';

interface ProfileScreenProps {
  email: string;
  onBack: () => void;
}

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
    backgroundColor: '#0b0f19',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#243049',
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnText: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    padding: 24,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  profileCard: {
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: '#243049',
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2a40',
  },
  profileLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 4,
  },
  profileValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
