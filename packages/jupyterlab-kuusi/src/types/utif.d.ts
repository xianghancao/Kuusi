declare module "utif" {
  export interface IFD {
    width: number;
    height: number;
    data?: Uint8Array;
  }

  export function decode(buffer: ArrayBuffer): IFD[];
  export function decodeImages(buffer: ArrayBuffer, ifds: IFD[]): void;
  export function toRGBA8(ifd: IFD): Uint8Array;
}
