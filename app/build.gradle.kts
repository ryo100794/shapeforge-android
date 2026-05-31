import com.android.build.gradle.internal.api.BaseVariantOutputImpl

plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.ryo100794.shapeforge"
    compileSdk = 34

    defaultConfig {
        applicationId = "io.github.ryo100794.shapeforge"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    applicationVariants.all {
        val variantBuildType = buildType.name
        outputs.all {
            (this as BaseVariantOutputImpl).outputFileName = "ShapeForge-0.1.0-${variantBuildType}.apk"
        }
    }
}
