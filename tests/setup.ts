// CI runners are slower than a dev machine: wait longer for async UI before a test fails, so timing never flakes the release gate.
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 15000 });
