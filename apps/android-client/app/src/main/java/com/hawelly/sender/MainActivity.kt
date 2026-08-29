package com.hawelly.sender

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hawelly.sender.data.ApiClient
import com.hawelly.sender.data.HawellyRepository
import com.hawelly.sender.data.SecureSessionStore
import com.hawelly.sender.ui.HawellyApp
import com.hawelly.sender.ui.HawellyViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = HawellyRepository(
            ApiClient(BuildConfig.API_BASE_URL),
            SecureSessionStore(applicationContext)
        )
        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                HawellyViewModel(repository) as T
        }
        setContent {
            val model: HawellyViewModel = viewModel(factory = factory)
            HawellyApp(model)
        }
    }
}
