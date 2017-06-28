import * as crypto from "crypto";
import * as randomstring from "randomstring";

export default class HelperCrypto {
    public static hashPassword(password: string, salt: string): string {
        return crypto.createHash("sha256").update(password + salt).digest("hex");
    }

    public static generateSalt(): string {
        return randomstring.generate({
            length: 20
        });
    }
}
