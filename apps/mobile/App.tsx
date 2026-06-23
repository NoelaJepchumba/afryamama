import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Import screens
import LoginScreen from './screens/LoginScreen';
import MotherDashboardScreen from './screens/MotherDashboardScreen';
import AppointmentsScreen from './screens/AppointmentsScreen';
import RecordsScreen from './screens/RecordsScreen';
import ImmunizationScreen from './screens/ImmunizationScreen';
import WellnessTipsScreen from './screens/WellnessTipsScreen';
import ProfileScreen from './screens/ProfileScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import MilestonesScreen from './screens/MilestonesScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import GrowthMonitoringScreen from './screens/GrowthMonitoringScreen';
import { firebaseAuth } from './lib/firebaseClient';
import { loadMotherProfile, loginWithFirebase, loginWithMotherCollection, logoutFromFirebase } from './lib/firebaseAuth';

type Screen =
  | 'LOGIN'
  | 'DASHBOARD'
  | 'APPOINTMENTS'
  | 'RECORDS'
  | 'IMMUNIZATION'
  | 'WELLNESS'
  | 'PROFILE'
  | 'SCHEDULE'
  | 'MILESTONES'
  | 'NOTIFICATIONS'
  | 'GROWTH';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('LOGIN');
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [pregnancyWeek, setPregnancyWeek] = useState<number | null>(null);
  const [nextAppointmentText, setNextAppointmentText] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        setUserName('');
        setUserEmail('');
        setPregnancyWeek(null);
        setNextAppointmentText(null);
        setCurrentScreen('LOGIN');
        return;
      }

      const profile = await loadMotherProfile(user);
      setUserName(profile.displayName);
      setUserEmail(user.email || '');
      setPregnancyWeek(profile.pregnancyWeek);
      setNextAppointmentText(profile.nextAppointmentText);
      setCurrentScreen('DASHBOARD');
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = async (email: string, password: string) => {
    try {
      await loginWithFirebase(email, password);
      return;
    } catch {
      const fallbackProfile = await loginWithMotherCollection(email, password);
      if (!fallbackProfile) {
        throw new Error('Invalid credentials.');
      }

      setUserEmail(email.trim().toLowerCase());
      setUserName(fallbackProfile.displayName);
      setPregnancyWeek(fallbackProfile.pregnancyWeek);
      setNextAppointmentText(fallbackProfile.nextAppointmentText);
      setCurrentScreen('DASHBOARD');
    }
  };

  const handleLogout = async () => {
    await logoutFromFirebase();
    setUserName('');
    setUserEmail('');
    setPregnancyWeek(null);
    setNextAppointmentText(null);
    setCurrentScreen('LOGIN');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'LOGIN':
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
      case 'DASHBOARD':
        return (
          <MotherDashboardScreen
            userName={userName}
            pregnancyWeek={pregnancyWeek}
            nextAppointmentText={nextAppointmentText}
            onNavigate={(screen) => setCurrentScreen(screen as Screen)}
            onLogout={handleLogout}
          />
        );
      case 'APPOINTMENTS':
        return <AppointmentsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'RECORDS':
        return <RecordsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'IMMUNIZATION':
        return <ImmunizationScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'WELLNESS':
        return <WellnessTipsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'PROFILE':
        return <ProfileScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'SCHEDULE':
        return <ScheduleScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'MILESTONES':
        return <MilestonesScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'NOTIFICATIONS':
        return <NotificationsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'GROWTH':
        return <GrowthMonitoringScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      default:
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.wrapper}>
          {renderScreen()}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  wrapper: {
    flex: 1,
  },
});
