import { AppRegistry, Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import './notify'; // defines the background update check before anything else runs
import App from './App';
import { widgetTaskHandler } from './widget';

AppRegistry.registerComponent('main', () => App);
if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
