import React from 'react';
import {Composition} from 'remotion';
import {LinelessGeneralTest} from './LinelessGeneralTest';
import {FPS, TOTAL_FRAMES} from './timeline';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LinelessGeneralTest"
      component={LinelessGeneralTest}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
