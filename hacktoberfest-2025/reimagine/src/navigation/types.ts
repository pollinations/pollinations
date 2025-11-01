import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ImageSource } from '../types/imageSelection';
import { TransformationChain } from '../types/transformation';

/**
 * Bottom Tab Navigator
 */
export type TabParamList = {
  Home: undefined;
  Profile: undefined;
};

export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<
  TabParamList,
  T
>;

/**
 * Root Stack Navigator
 */
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  EditScreen: {
    selectedImages: ImageSource[];
    chainId?: string;
  };
  TransformationDetail: {
    chain: TransformationChain;
  };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
