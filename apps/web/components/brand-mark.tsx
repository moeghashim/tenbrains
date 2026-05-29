import type { SVGProps } from "react";
import { useId } from "react";
import React from "react";

export interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, "children" | "viewBox"> {}

export function BrandMark(props: Readonly<BrandMarkProps>) {
	const id = useId();
	const paint0 = `${id}-paint0`;
	const paint1 = `${id}-paint1`;
	const paint2 = `${id}-paint2`;

	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 256 256"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<rect x="24" y="24" width="208" height="208" rx="52" fill={`url(#${paint0})`} />
			<path
				d="M84 176V82h-18V58h48v118H84Zm82 2c-26.4 0-46-20.9-46-61s19.6-61 46-61 46 20.9 46 61-19.6 61-46 61Zm0-27c10.6 0 18-10.6 18-34s-7.4-34-18-34-18 10.6-18 34 7.4 34 18 34Z"
				fill="#052A30"
				fillOpacity="0.72"
			/>
			<path d="M61 193h134" stroke={`url(#${paint1})`} strokeLinecap="round" strokeWidth="14" />
			<circle cx="61" cy="193" r="16" fill={`url(#${paint2})`} />
			<circle cx="128" cy="193" r="16" fill={`url(#${paint2})`} />
			<circle cx="195" cy="193" r="16" fill={`url(#${paint2})`} />
			<defs>
				<linearGradient id={paint0} x1="35" x2="224" y1="35" y2="224" gradientUnits="userSpaceOnUse">
					<stop stopColor="#26D192" offset="0" />
					<stop stopColor="#00CED9" offset="0.55" />
					<stop stopColor="#0B789C" offset="1" />
				</linearGradient>
				<linearGradient id={paint1} x1="61" x2="195" y1="193" y2="193" gradientUnits="userSpaceOnUse">
					<stop stopColor="#9BF78E" offset="0" />
					<stop stopColor="#00CED9" offset=".998" />
				</linearGradient>
				<linearGradient id={paint2} x1="55" x2="201" y1="181" y2="206" gradientUnits="userSpaceOnUse">
					<stop stopColor="#85EEA0" offset="0" />
					<stop stopColor="#00D6D6" offset=".998" />
				</linearGradient>
			</defs>
		</svg>
	);
}
