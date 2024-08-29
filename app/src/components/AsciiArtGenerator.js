import React, { useEffect, useRef, useState } from 'react';

const selectedCharacterSet =
    "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,^`'. .:â–‘â–’â–“â–ˆ";
const characterSetLength = selectedCharacterSet.length;

const calculateCharacter = (
    x,
    y,
    cols,
    rows,
    aspect,
    time,
) => {
    const timeFactor = time * 0.000_08;
    const size = Math.min(cols, rows);
    const aspectRatio = aspect * 0.2;
    const position = {
        x: ((4 * (x - cols / 6.25)) / size) * aspectRatio,
        y: (5 * (y - rows / 4)) / size,
    };

    const index =
        Math.floor(
            Math.abs(
                Math.cos(position.x * position.x - position.y * position.y) -
                timeFactor,
            ) *
            characterSetLength +
            (Math.floor(x) % 2) * 2,
        ) % characterSetLength;
    return selectedCharacterSet[index];
};

const AsciiArtGenerator = () => {
    const textRef = useRef(null);
    const [size, setSize] = useState({ height: null, width: null });

    useEffect(() => {
        const handleResize = () => {
            setSize({ height: window.innerHeight, width: Math.min(window.innerWidth, 600) });
        };

        // Initial size setting
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        const element = textRef.current;
        if (!element || !size.width || !size.height) return undefined;

        const cols = Math.floor(size.width / 12) * 1.6;
        const rows = Math.floor(size.height / 12);
        const aspectRatio = cols / rows;

        const intervalId = setInterval(() => {
            let content = '';

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    content += calculateCharacter(
                        x,
                        y,
                        cols,
                        rows,
                        aspectRatio,
                        Date.now(),
                    );
                }

                content += '\n';
            }

            element.textContent = content;
        }, 1_000 / 12); // 60 fps

        return () => {
            clearInterval(intervalId);
        };
    }, [size]);

    return (
        <div
            ref={textRef}
            style={{
                height: '100%',
                overflow: 'hidden',
                whiteSpace: 'pre',
                width: '100%',
                maxWidth: '600px',
                maxHeight: '150px',
                margin: '0 auto',
            }}
        />
    );
};

export default AsciiArtGenerator;