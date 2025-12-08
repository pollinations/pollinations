import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ImageSource } from '../types/imageSelection';


export type TabParamList = {
  Home: undefined;
  Profile: undefined;
};


export type RootStackParamList = {
  MainTabs: undefined;
  EditScreen: {
    selectedImages: ImageSource[];
    chainId?: string; /
  };
};

export type TabScreenProps<T extends keyof TabParamList> = 
  BottomTabScreenProps<TabParamList, T>;

export type RootStackScreenProps<T extends keyof RootStackParamList> = 
  NativeStackScreenProps<RootStackParamList, T>;