import CoreImage
import ExpoModulesCore
import UIKit
import Vision

public final class VehifyPlateDetectorModule: Module {
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  public func definition() -> ModuleDefinition {
    Name("VehifyPlateDetector")

    AsyncFunction("detectRectanglesAsync") { (url: URL) -> [[String: Any]] in
      guard
        let image = UIImage(contentsOfFile: url.path),
        let cgImage = image.cgImage
      else {
        throw PlateDetectorError.imageLoadFailed
      }

      let request = VNDetectRectanglesRequest()
      request.maximumObservations = 12
      request.minimumConfidence = 0.35
      request.minimumSize = 0.08
      request.minimumAspectRatio = 0.2
      request.maximumAspectRatio = 0.85
      request.quadratureTolerance = 35

      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
      try handler.perform([request])

      return (request.results ?? []).map { observation in
        [
          "confidence": Double(observation.confidence),
          // Vision uses a bottom-left origin; React Native images use top-left.
          "corners": [
            Double(observation.topLeft.x), Double(1 - observation.topLeft.y),
            Double(observation.topRight.x), Double(1 - observation.topRight.y),
            Double(observation.bottomRight.x), Double(1 - observation.bottomRight.y),
            Double(observation.bottomLeft.x), Double(1 - observation.bottomLeft.y)
          ]
        ]
      }
    }

    AsyncFunction("rectifyPlateAsync") {
      (url: URL, normalizedCorners: [Double]) -> [String: Any] in
      guard normalizedCorners.count == 8 else {
        throw PlateDetectorError.invalidCorners
      }
      guard
        let image = UIImage(contentsOfFile: url.path),
        let cgImage = image.cgImage
      else {
        throw PlateDetectorError.imageLoadFailed
      }

      let width = CGFloat(cgImage.width)
      let height = CGFloat(cgImage.height)
      let uiPoints = stride(from: 0, to: 8, by: 2).map { index in
        CGPoint(
          x: CGFloat(normalizedCorners[index]) * width,
          y: CGFloat(normalizedCorners[index + 1]) * height
        )
      }

      let ciImage = CIImage(cgImage: cgImage)
      guard let filter = CIFilter(name: "CIPerspectiveCorrection") else {
        throw PlateDetectorError.filterUnavailable
      }
      // Core Image and Vision both use bottom-left coordinates. Convert the
      // top-left UI points supplied by JavaScript back into that coordinate
      // space before applying the homography.
      let ciPoints = uiPoints.map { CGPoint(x: $0.x, y: height - $0.y) }
      filter.setValue(ciImage, forKey: kCIInputImageKey)
      filter.setValue(CIVector(cgPoint: ciPoints[0]), forKey: "inputTopLeft")
      filter.setValue(CIVector(cgPoint: ciPoints[1]), forKey: "inputTopRight")
      filter.setValue(CIVector(cgPoint: ciPoints[2]), forKey: "inputBottomRight")
      filter.setValue(CIVector(cgPoint: ciPoints[3]), forKey: "inputBottomLeft")

      guard
        let output = filter.outputImage,
        !output.extent.isEmpty,
        let rectifiedCG = ciContext.createCGImage(output, from: output.extent)
      else {
        throw PlateDetectorError.rectificationFailed
      }

      let rectified = UIImage(cgImage: rectifiedCG)
      let preview = highlightedPreview(image: UIImage(cgImage: cgImage), points: uiPoints)
      let rectifiedURL = try writeTemporaryJPEG(rectified, prefix: "vehify-plate")
      let previewURL = try writeTemporaryJPEG(preview, prefix: "vehify-plate-preview")

      return [
        "rectifiedUri": rectifiedURL.absoluteString,
        "previewUri": previewURL.absoluteString,
        "width": rectifiedCG.width,
        "height": rectifiedCG.height
      ]
    }
  }

  private func highlightedPreview(image: UIImage, points: [CGPoint]) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
    return renderer.image { context in
      image.draw(in: CGRect(origin: .zero, size: image.size))
      let path = roundedPolygon(points: points, radius: max(10, image.size.width * 0.014))
      UIColor.systemGreen.withAlphaComponent(0.25).setFill()
      path.fill()
    }
  }

  /** Round each corner of a perspective quadrilateral without altering it. */
  private func roundedPolygon(points: [CGPoint], radius: CGFloat) -> UIBezierPath {
    guard points.count >= 3 else { return UIBezierPath() }

    func offset(from point: CGPoint, toward other: CGPoint, by requested: CGFloat) -> CGPoint {
      let dx = other.x - point.x
      let dy = other.y - point.y
      let length = hypot(dx, dy)
      guard length > 0 else { return point }
      let distance = min(requested, length * 0.22)
      return CGPoint(
        x: point.x + dx / length * distance,
        y: point.y + dy / length * distance
      )
    }

    let incoming = points.indices.map { index in
      offset(
        from: points[index],
        toward: points[(index - 1 + points.count) % points.count],
        by: radius
      )
    }
    let outgoing = points.indices.map { index in
      offset(
        from: points[index],
        toward: points[(index + 1) % points.count],
        by: radius
      )
    }

    let path = UIBezierPath()
    path.move(to: outgoing[0])
    for index in 1..<points.count {
      path.addLine(to: incoming[index])
      path.addQuadCurve(to: outgoing[index], controlPoint: points[index])
    }
    path.addLine(to: incoming[0])
    path.addQuadCurve(to: outgoing[0], controlPoint: points[0])
    path.close()
    return path
  }

  private func writeTemporaryJPEG(_ image: UIImage, prefix: String) throws -> URL {
    guard let data = image.jpegData(compressionQuality: 0.94) else {
      throw PlateDetectorError.imageEncodingFailed
    }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("\(prefix)-\(UUID().uuidString).jpg")
    try data.write(to: url, options: .atomic)
    return url
  }
}

private enum PlateDetectorError: String, Error {
  case imageLoadFailed
  case invalidCorners
  case filterUnavailable
  case rectificationFailed
  case imageEncodingFailed
}
