import { colors } from "@cliffy/ansi/colors";
import { version } from "../version.ts";

/**
 * Display the nsyte ASCII logo
 */
export function displayLogo(): void {
  console.log(colors.cyan(`
                             dP            
                             88            
88d888b. .d8888b. dP    dP d8888P .d8888b. 
88'  \`88 Y8ooooo. 88    88   88   88ooood8 
88    88       88 88.  .88   88   88.  ... 
dP    dP \`88888P' \`8888P88   dP   \`88888P' 
                       .88                 
                   d8888P        ${colors.white(`v${version}`)}
`));
} 